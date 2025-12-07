'use client';

import { useState, useEffect } from 'react';
import { type Material } from '@/lib/materials';
import { type Quiz, type QuizQuestion } from '@/lib/services';
import {
  startQuiz,
  submitQuiz,
  checkCooldown,
  type CooldownStatus,
  type QuizResult,
} from '@/lib/quiz';
import { extractVideoId, estimateMaterialDuration } from '@/lib/utils';
import {
  Play,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Trophy,
  FileText,
  Youtube,
} from 'lucide-react';
import Link from 'next/link';

interface MaterialPageClientProps {
  material: Material;
}

export function MaterialPageClient({ material }: MaterialPageClientProps) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState<CooldownStatus | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionTimeLeft, setQuestionTimeLeft] = useState<number | null>(null);

  // Sprawdź cooldown przy załadowaniu
  useEffect(() => {
    checkCooldownStatus();
  }, [material.id]);

  // Licznik cooldownu
  useEffect(() => {
    if (cooldown && !cooldown.allowed && cooldown.remainingSeconds) {
      setRemainingSeconds(cooldown.remainingSeconds);
      const interval = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            checkCooldownStatus(); // Sprawdź ponownie
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [cooldown]);

  async function checkCooldownStatus() {
    const status = await checkCooldown(material.id);
    setCooldown(status);
    if (status.remainingSeconds) {
      setRemainingSeconds(status.remainingSeconds);
    }
  }

  async function handleSubmitQuiz() {
    // Usuń walidację - teraz pozwalamy na nieodpowiedzenie na pytania (są oznaczone jako -1)
    if (!quiz) {
      alert('Błąd: Quiz nie jest dostępny');
      return;
    }

    setLoading(true);
    setQuestionTimeLeft(null); // Zatrzymaj timer
    try {
      // Przekaż quiz, który był wyświetlony użytkownikowi
      const result = await submitQuiz(material.id, answers, quiz);
      setQuizResult(result);
      setQuizSubmitted(true);

      if (result.success && result.passed) {
        setShowConfetti(true);
        // Ukryj confetti po 5 sekundach
        setTimeout(() => setShowConfetti(false), 5000);
      }

      // Odśwież cooldown (jeśli nie zaliczono, będzie aktywny)
      if (!result.passed) {
        await checkCooldownStatus();
      }
    } catch (error) {
      alert('Nieoczekiwany błąd');
    } finally {
      setLoading(false);
    }
  }

  function handleNextQuestion() {
    if (!quiz || quizSubmitted) return;
    
    // Jeśli to ostatnie pytanie, automatycznie wyślij quiz
    if (currentQuestionIndex >= quiz.pytania.length - 1) {
      handleSubmitQuiz();
      return;
    }

    // Przejdź do następnego pytania
    setCurrentQuestionIndex((prev) => prev + 1);
    setQuestionTimeLeft(30);
  }

  // Timer dla aktualnego pytania (30 sekund)
  useEffect(() => {
    if (quizStarted && !quizSubmitted && questionTimeLeft !== null && questionTimeLeft > 0 && quiz) {
      const interval = setInterval(() => {
        setQuestionTimeLeft((prev) => {
          if (prev === null || prev <= 1) {
            // Czas minął - przejdź do następnego pytania
            // Wywołujemy handleNextQuestion, który sprawdzi czy to ostatnie pytanie
            setTimeout(() => {
              handleNextQuestion();
            }, 0);
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [quizStarted, quizSubmitted, questionTimeLeft, quiz]);

  // Resetuj timer przy zmianie pytania
  useEffect(() => {
    if (quizStarted && !quizSubmitted && quiz && currentQuestionIndex < quiz.pytania.length) {
      setQuestionTimeLeft(30);
    }
  }, [currentQuestionIndex, quizStarted, quizSubmitted]);

  async function handleStartQuiz() {
    setLoading(true);
    try {
      const result = await startQuiz(material.id);
      if (result.success && result.quiz) {
        // 🔍 DEBUG - Tymczasowe logi do debugowania pustych odpowiedzi
        console.log('🔍 DEBUG - Otrzymany quiz:', JSON.stringify(result.quiz, null, 2));
        console.log('🔍 DEBUG - Liczba pytań:', result.quiz.pytania.length);
        console.log('🔍 DEBUG - Pierwsze pytanie:', result.quiz.pytania[0]);
        if (result.quiz.pytania[0]) {
          console.log('🔍 DEBUG - Odpowiedzi pierwszego pytania:', result.quiz.pytania[0].odpowiedzi);
          console.log('🔍 DEBUG - Długości odpowiedzi:', result.quiz.pytania[0].odpowiedzi?.map((o: string, i: number) => `${i}: ${o?.length || 0} znaków`));
        }
        // Sprawdź wszystkie pytania pod kątem pustych odpowiedzi
        result.quiz.pytania.forEach((pytanie: QuizQuestion, index: number) => {
          const hasEmpty = pytanie.odpowiedzi?.some((odp: string) => !odp || odp.trim().length === 0);
          if (hasEmpty) {
            console.error(`🔍 DEBUG - ⚠️ Pytanie ${index + 1} ma puste odpowiedzi:`, pytanie);
          }
        });
        
        setQuiz(result.quiz);
        setQuizStarted(true);
        setAnswers(new Array(result.quiz.pytania.length).fill(-1));
        setQuizSubmitted(false);
        setQuizResult(null);
        setCurrentQuestionIndex(0);
        setQuestionTimeLeft(30); // 30 sekund na pytanie
      } else if (result.cooldown && !result.cooldown.allowed) {
        setCooldown(result.cooldown);
        if (result.cooldown.remainingSeconds) {
          setRemainingSeconds(result.cooldown.remainingSeconds);
        }
      } else {
        alert(result.error || 'Nie udało się rozpocząć quizu');
      }
    } catch (error) {
      alert('Nieoczekiwany błąd');
    } finally {
      setLoading(false);
    }
  }

  function handleAnswerSelect(questionIndex: number, answerIndex: number) {
    if (quizSubmitted) return;
    const newAnswers = [...answers];
    newAnswers[questionIndex] = answerIndex;
    setAnswers(newAnswers);
  }

  function handleSkipQuestion() {
    // Oznacz pytanie jako nieodpowiedziane (-1) i przejdź dalej
    handleNextQuestion();
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // YouTube URL z start_offset
  const videoId = material.video_url ? extractVideoId(material.video_url) : null;
  const youtubeEmbedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?start=${material.start_offset}`
    : null;
  const duration = estimateMaterialDuration(material.content_text, material.type);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Nagłówek */}
        <div className="mb-6 sm:mb-8">
          <Link
            href="/student"
            className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 mb-4 font-medium transition-colors group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Powrót do listy materiałów
          </Link>
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/20">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-800 mb-3">
              {material.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-100 rounded-full">
                {material.type === 'youtube' ? (
                  <>
                    <Youtube className="text-red-600" size={18} />
                    <span className="text-sm font-semibold text-indigo-700">
                      Wideo YouTube
                    </span>
                  </>
                ) : (
                  <>
                    <FileText className="text-blue-600" size={18} />
                    <span className="text-sm font-semibold text-indigo-700">
                      Dokument PDF
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full">
                <Clock className="text-gray-600" size={18} />
                <span className="text-sm font-semibold text-gray-700">
                  ~{duration} min
                </span>
              </div>
              {material.reward_minutes && material.reward_minutes > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 rounded-full">
                  <Trophy className="text-emerald-600" size={18} />
                  <span className="text-sm font-semibold text-emerald-700">
                    +{material.reward_minutes} min nagrody
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sekcja Nauki */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-6 mb-6 sm:mb-8 border border-white/20">
          <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Play className="text-indigo-600" size={24} />
            </div>
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Sekcja Nauki
            </span>
          </h2>

          {material.type === 'youtube' && youtubeEmbedUrl ? (
            <div className="aspect-video rounded-xl overflow-hidden bg-black shadow-lg">
              <iframe
                src={youtubeEmbedUrl}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          ) : material.type === 'pdf' && material.video_url ? (
            <div className="space-y-4">
              {/* PDF Viewer */}
              <div className="rounded-xl overflow-hidden bg-gray-100 shadow-lg" style={{ height: '800px' }}>
                <iframe
                  src={material.video_url}
                  className="w-full h-full border-0"
                  title={material.title}
                ></iframe>
              </div>
              
              {/* Przycisk do pobrania */}
              <div className="flex justify-center">
                <a
                  href={material.video_url}
                  download={material.title + '.pdf'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                >
                  <Download size={20} />
                  <span>Pobierz PDF</span>
                </a>
              </div>
            </div>
          ) : material.type === 'pdf' ? (
            <div className="text-center py-12 px-4">
              <div className="inline-flex p-4 bg-blue-100 rounded-full mb-4">
                <FileText className="text-blue-600" size={48} />
              </div>
              <p className="text-gray-700 font-medium mb-2 text-lg">
                Materiał PDF został przetworzony
              </p>
              <p className="text-gray-600 text-sm max-w-md mx-auto">
                Treść dokumentu jest dostępna w bazie danych i będzie użyta do
                wygenerowania quizu.
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">Materiał nie jest dostępny.</p>
            </div>
          )}
        </div>

        {/* Sekcja Quizu */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-6 border border-white/20">
          <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Trophy className="text-yellow-600" size={24} />
            </div>
            <span className="bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
              Quiz
            </span>
          </h2>

          {!quizStarted ? (
            <div className="text-center py-8 sm:py-12">
              {cooldown && !cooldown.allowed ? (
                <div className="space-y-6 max-w-md mx-auto">
                  <div className="inline-flex p-4 bg-orange-100 rounded-full">
                    <Clock className="text-orange-600" size={56} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">
                      Quiz jest zablokowany
                    </h3>
                    <p className="text-gray-600 text-base">
                      Musisz poczekać przed kolejną próbą po nieudanym quizzie.
                    </p>
                  </div>
                  {remainingSeconds !== null && (
                    <div className="bg-gradient-to-br from-orange-100 to-red-100 rounded-2xl p-8 shadow-lg border-2 border-orange-200">
                      <div className="text-5xl sm:text-6xl font-black text-orange-600 mb-2 font-mono">
                        {formatTime(remainingSeconds)}
                      </div>
                      <p className="text-sm font-semibold text-orange-700 uppercase tracking-wide">
                        Pozostało do odblokowania
                      </p>
                    </div>
                  )}
                  <button
                    onClick={checkCooldownStatus}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold transition-colors"
                  >
                    Odśwież
                  </button>
                </div>
              ) : (
                <div className="space-y-6 max-w-lg mx-auto">
                  <div className="inline-flex p-4 bg-yellow-100 rounded-full">
                    <Trophy className="text-yellow-600" size={56} />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-3">
                      Gotowy na quiz?
                    </h3>
                    <p className="text-gray-600 text-base leading-relaxed">
                      Rozwiąż <span className="font-bold text-indigo-600">10 pytań</span> wielokrotnego wyboru.
                      <br />
                      Aby zdobyć nagrodę, musisz uzyskać minimum{' '}
                      <span className="font-bold text-emerald-600">9/10</span> poprawnych odpowiedzi.
                    </p>
                  </div>
                  <button
                    onClick={handleStartQuiz}
                    disabled={loading}
                    className="px-8 py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 mx-auto shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin" size={22} />
                        <span>Generowanie quizu...</span>
                      </>
                    ) : (
                      <>
                        <Play size={22} />
                        <span>Rozpocznij Quiz</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : quizSubmitted ? (
            // Widok wyników - wszystkie pytania
            <div className="space-y-6">
              {quiz?.pytania.map((pytanie: QuizQuestion, index: number) => (
                <div
                  key={index}
                  className={`border-2 rounded-xl p-5 sm:p-6 transition-all ${
                    answers[index] === pytanie.poprawna_odpowiedz
                      ? 'border-emerald-400 bg-gradient-to-br from-emerald-50 to-green-50 shadow-md'
                      : 'border-red-300 bg-gradient-to-br from-red-50 to-pink-50 shadow-md'
                  }`}
                >
                  <h3 className="font-bold text-lg sm:text-xl mb-5 text-gray-800">
                    <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg mr-3 font-bold">
                      {index + 1}
                    </span>
                    {pytanie.pytanie}
                  </h3>
                  <div className="space-y-3">
                    {pytanie.odpowiedzi.map((odpowiedz, answerIndex) => {
                      const isSelected = answers[index] === answerIndex;
                      const isCorrect = answerIndex === pytanie.poprawna_odpowiedz;
                      const isWrong = isSelected && !isCorrect;

                      return (
                        <button
                          key={answerIndex}
                          disabled
                          className={`w-full text-left p-4 rounded-xl border-2 transition-all font-medium ${
                            isCorrect
                              ? 'border-emerald-500 bg-emerald-100 text-emerald-900'
                              : isWrong
                              ? 'border-red-400 bg-red-100 text-red-900'
                              : 'border-gray-200 bg-gray-50 text-gray-600'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-lg">
                              {String.fromCharCode(65 + answerIndex)}.
                            </span>
                            <span className="flex-1">{odpowiedz}</span>
                            {isCorrect && (
                              <CheckCircle2 className="ml-auto text-emerald-600 flex-shrink-0" size={22} />
                            )}
                            {isWrong && (
                              <XCircle className="ml-auto text-red-600 flex-shrink-0" size={22} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {pytanie.uzasadnienie && (
                    <div className="mt-5 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                      <p className="text-sm font-semibold text-indigo-900 mb-1">
                        💡 Uzasadnienie:
                      </p>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {pytanie.uzasadnienie}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Widok aktywnego quizu - jedno pytanie na raz
            quiz && currentQuestionIndex < quiz.pytania.length && (
              <div className="space-y-6">
                {/* Timer i numer pytania */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-gray-700">
                      Pytanie {currentQuestionIndex + 1} z {quiz.pytania.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-100 to-red-100 rounded-full border-2 border-orange-300">
                    <Clock className="text-orange-600" size={20} />
                    <span className="text-xl font-bold text-orange-700 font-mono">
                      {questionTimeLeft !== null ? questionTimeLeft : 30}s
                    </span>
                  </div>
                </div>

                {/* Aktualne pytanie */}
                {(() => {
                  const pytanie = quiz.pytania[currentQuestionIndex];
                  const index = currentQuestionIndex;
                  const selectedAnswer = answers[index];

                  return (
                    <div className="border-2 border-gray-200 bg-white rounded-xl p-5 sm:p-6 shadow-lg">
                      <h3 className="font-bold text-lg sm:text-xl mb-6 text-gray-800">
                        {pytanie.pytanie}
                      </h3>
                      <div className="space-y-3 mb-6">
                        {pytanie.odpowiedzi.map((odpowiedz, answerIndex) => {
                          const isSelected = selectedAnswer === answerIndex;

                          return (
                            <button
                              key={answerIndex}
                              onClick={() => handleAnswerSelect(index, answerIndex)}
                              disabled={loading}
                              className={`w-full text-left p-4 rounded-xl border-2 transition-all font-medium ${
                                isSelected
                                  ? 'border-indigo-500 bg-indigo-100 text-indigo-900 shadow-md'
                                  : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-lg">
                                  {String.fromCharCode(65 + answerIndex)}.
                                </span>
                                <span className="flex-1">{odpowiedz}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Przyciski nawigacji */}
                      <div className="flex justify-between gap-4 pt-4 border-t border-gray-200">
                        <button
                          onClick={handleSkipQuestion}
                          disabled={loading}
                          className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Pomiń (przejdź dalej)
                        </button>
                        <button
                          onClick={handleNextQuestion}
                          disabled={loading}
                          className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
                        >
                          {currentQuestionIndex >= quiz.pytania.length - 1
                            ? 'Zakończ Quiz'
                            : 'Następne pytanie →'}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )
          )}

          {/* Wynik quizu - wyświetlany po pytaniach */}
          {quizSubmitted && quizResult && (
            <div className="mt-8 text-center py-8 sm:py-12 space-y-6 bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 border-2 border-gray-200">
              {quizResult.passed ? (
                <>
                  <div className="text-7xl sm:text-8xl mb-6 animate-bounce">
                    🎉
                  </div>
                  <h3 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent mb-3">
                    Gratulacje! Zaliczyłeś quiz!
                  </h3>
                  <div className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-100 rounded-full mb-4">
                    <span className="text-2xl font-black text-emerald-700">
                      {quizResult.score}/10
                    </span>
                    <span className="text-emerald-700 font-semibold">
                      poprawnych odpowiedzi
                    </span>
                  </div>
                  {quizResult.rewardMinutes && quizResult.rewardMinutes > 0 && (
                    <div className="bg-gradient-to-br from-yellow-400 via-orange-500 to-pink-500 text-white rounded-2xl p-6 sm:p-8 shadow-2xl transform hover:scale-105 transition-transform">
                      <p className="text-3xl sm:text-4xl font-black mb-2">
                        +{quizResult.rewardMinutes} minut
                      </p>
                      <p className="text-lg font-semibold opacity-95">
                        na telefon! 📱
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="inline-flex p-4 bg-red-100 rounded-full mb-4">
                    <XCircle className="text-red-600" size={64} />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-red-600 mb-3">
                    Nie udało się zaliczyć
                  </h3>
                  <div className="inline-flex items-center gap-2 px-6 py-3 bg-red-100 rounded-full mb-4">
                    <span className="text-2xl font-black text-red-700">
                      {quizResult.score}/10
                    </span>
                    <span className="text-red-700 font-semibold">
                      poprawnych odpowiedzi
                    </span>
                  </div>
                  <div className="max-w-md mx-auto space-y-3">
                    <p className="text-gray-700 font-medium">
                      Musisz uzyskać minimum{' '}
                      <span className="font-bold text-emerald-600">9/10</span>, aby
                      zaliczyć quiz.
                    </p>
                    <div className="bg-orange-100 border-2 border-orange-300 rounded-xl p-4">
                      <p className="text-orange-800 font-semibold">
                        ⏱️ Quiz będzie zablokowany na 10 minut.
                      </p>
                    </div>
                  </div>
                </>
              )}
              <div className="mt-8">
                <Link
                  href="/student"
                  className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-lg hover:from-indigo-700 hover:to-purple-700 inline-block shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                >
                  Powrót do listy materiałów
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Confetti overlay */}
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-50">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-9xl animate-bounce">🎉</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


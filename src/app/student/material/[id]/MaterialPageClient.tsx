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
import {
  CONFETTI_DURATION_MS,
  QUESTION_TIMER_SECONDS,
  COOLDOWN_MINUTES,
  PASSING_PERCENTAGE,
} from '@/lib/constants';
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
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    checkCooldownStatus();
  }, [material.id]);

  useEffect(() => {
    if (cooldown && !cooldown.allowed && cooldown.remainingSeconds) {
      setRemainingSeconds(cooldown.remainingSeconds);
      const interval = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            checkCooldownStatus();
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
    if (!quiz) {
      setSubmitError('Quiz is not available. Please refresh and try again.');
      return;
    }

    setLoading(true);
    setSubmitError(null);
    setQuestionTimeLeft(null);
    try {
      const result = await submitQuiz(material.id, answers, quiz);
      setQuizResult(result);
      setQuizSubmitted(true);

      if (result.success && result.passed) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), CONFETTI_DURATION_MS);
      }

      if (!result.passed) {
        await checkCooldownStatus();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleNextQuestion() {
    if (!quiz || quizSubmitted) return;
    
    if (currentQuestionIndex >= quiz.questions.length - 1) {
      handleSubmitQuiz();
      return;
    }

    setCurrentQuestionIndex((prev) => prev + 1);
    setQuestionTimeLeft(QUESTION_TIMER_SECONDS);
  }

  useEffect(() => {
    if (quizStarted && !quizSubmitted && questionTimeLeft !== null && questionTimeLeft > 0 && quiz) {
      const interval = setInterval(() => {
        setQuestionTimeLeft((prev) => {
          if (prev === null || prev <= 1) {
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

  useEffect(() => {
    if (quizStarted && !quizSubmitted && quiz && currentQuestionIndex < quiz.questions.length) {
      setQuestionTimeLeft(QUESTION_TIMER_SECONDS);
    }
  }, [currentQuestionIndex, quizStarted, quizSubmitted]);

  async function handleStartQuiz() {
    setLoading(true);
    try {
      const result = await startQuiz(material.id);
      if (result.success && result.quiz) {
        setQuiz(result.quiz);
        setQuizStarted(true);
        setAnswers(new Array(result.quiz.questions.length).fill(-1));
        setQuizSubmitted(false);
        setQuizResult(null);
        setCurrentQuestionIndex(0);
        setQuestionTimeLeft(QUESTION_TIMER_SECONDS);
      } else if (result.cooldown && !result.cooldown.allowed) {
        setCooldown(result.cooldown);
        if (result.cooldown.remainingSeconds) {
          setRemainingSeconds(result.cooldown.remainingSeconds);
        }
      } else {
        alert(result.error || 'Failed to start the quiz');
      }
    } catch (error) {
      alert('Unexpected error');
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
    handleNextQuestion();
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  const videoId = material.video_url ? extractVideoId(material.video_url) : null;
  const youtubeEmbedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?start=${material.start_offset}${
        material.end_offset ? `&end=${material.end_offset}` : ''
      }`
    : null;
  const duration = estimateMaterialDuration(material.content_text, material.type);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <Link
            href="/student"
            className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 mb-4 font-medium transition-colors group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Back to materials
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
                      YouTube video
                    </span>
                  </>
                ) : (
                  <>
                    <FileText className="text-blue-600" size={18} />
                    <span className="text-sm font-semibold text-indigo-700">
                      PDF document
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full">
                <Clock className="text-gray-600" size={18} />
                <span className="text-sm font-semibold text-gray-700">
                  {material.type === 'youtube' && material.end_offset 
                    ? `Clip: ${Math.floor(material.start_offset / 60)}:${(material.start_offset % 60).toString().padStart(2, '0')} - ${Math.floor(material.end_offset / 60)}:${(material.end_offset % 60).toString().padStart(2, '0')}`
                    : material.type === 'youtube' && material.start_offset > 0
                    ? `From ${Math.floor(material.start_offset / 60)}:${(material.start_offset % 60).toString().padStart(2, '0')}`
                    : `~${duration} min`
                  }
                </span>
              </div>
              {material.reward_minutes && material.reward_minutes > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 rounded-full">
                  <Trophy className="text-emerald-600" size={18} />
                  <span className="text-sm font-semibold text-emerald-700">
                    +{material.reward_minutes} reward minutes
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Learning section */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-6 mb-6 sm:mb-8 border border-white/20">
          <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Play className="text-indigo-600" size={24} />
            </div>
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Learning
            </span>
          </h2>

          {/* Clip range info for study */}
          {material.type === 'youtube' && (material.start_offset > 0 || material.end_offset) && (
            <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl">
              <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                <span className="text-xl">📖</span>
                {material.end_offset 
                  ? `Your task: watch and understand the clip from ${Math.floor(material.start_offset / 60)}:${(material.start_offset % 60).toString().padStart(2, '0')} to ${Math.floor(material.end_offset / 60)}:${(material.end_offset % 60).toString().padStart(2, '0')}`
                  : `Your task: watch and understand the video from ${Math.floor(material.start_offset / 60)}:${(material.start_offset % 60).toString().padStart(2, '0')}`
                }
              </p>
              <p className="text-xs text-blue-700 mt-1">
                The quiz will cover only this part.
              </p>
            </div>
          )}

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
              
              <div className="flex justify-center">
                <a
                  href={material.video_url}
                  download={material.title + '.pdf'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                >
                  <Download size={20} />
                  <span>Download PDF</span>
                </a>
              </div>
            </div>
          ) : material.type === 'pdf' ? (
            <div className="text-center py-12 px-4">
              <div className="inline-flex p-4 bg-blue-100 rounded-full mb-4">
                <FileText className="text-blue-600" size={48} />
              </div>
              <p className="text-gray-700 font-medium mb-2 text-lg">
                PDF material has been processed
              </p>
              <p className="text-gray-600 text-sm max-w-md mx-auto">
                The document content is stored in the database and will be used to generate the quiz.
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">This material is not available.</p>
            </div>
          )}
        </div>

        {/* Quiz section */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-6 border border-white/20">
          <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Trophy className="text-yellow-600" size={24} />
            </div>
            <span className="bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
              Quiz
            </span>
          </h2>

          {submitError && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-3">
              <XCircle className="text-red-600 flex-shrink-0 mt-0.5" size={22} />
              <div className="flex-1">
                <p className="font-semibold text-red-800">Submission failed</p>
                <p className="text-sm text-red-700 mt-1">{submitError}</p>
                <button
                  type="button"
                  onClick={() => setSubmitError(null)}
                  className="mt-2 text-sm font-medium text-red-600 hover:text-red-800 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {!quizStarted ? (
            <div className="text-center py-8 sm:py-12">
              {cooldown && !cooldown.allowed ? (
                <div className="space-y-6 max-w-md mx-auto">
                  <div className="inline-flex p-4 bg-orange-100 rounded-full">
                    <Clock className="text-orange-600" size={56} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">
                      Quiz is locked
                    </h3>
                    <p className="text-gray-600 text-base">
                      You need to wait before trying again after a failed quiz.
                    </p>
                  </div>
                  {remainingSeconds !== null && (
                    <div className="bg-gradient-to-br from-orange-100 to-red-100 rounded-2xl p-8 shadow-lg border-2 border-orange-200">
                      <div className="text-5xl sm:text-6xl font-black text-orange-600 mb-2 font-mono">
                        {formatTime(remainingSeconds)}
                      </div>
                      <p className="text-sm font-semibold text-orange-700 uppercase tracking-wide">
                        Time until unlock
                      </p>
                    </div>
                  )}
                  <button
                    onClick={checkCooldownStatus}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              ) : (
                <div className="space-y-6 max-w-lg mx-auto">
                  <div className="inline-flex p-4 bg-yellow-100 rounded-full">
                    <Trophy className="text-yellow-600" size={56} />
                  </div>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-3">
                      Ready for a quiz?
                    </h3>
                    <p className="text-gray-600 text-base leading-relaxed">
                      Answer <span className="font-bold text-indigo-600">about 10</span> multiple-choice questions.
                      <br />
                      To earn the reward, you need at least{' '}
                      <span className="font-bold text-emerald-600">{Math.round(PASSING_PERCENTAGE * 100)}%</span> correct answers.
                    </p>
                    {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
                      <div className="mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 text-left">
                        <span className="font-semibold">Demo note:</span> In this demo the quiz questions are pre-generated and fixed — retrying will show the same questions. In the full version every quiz attempt is uniquely generated by AI from the material content.
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleStartQuiz}
                    disabled={loading}
                    className="px-8 py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 mx-auto shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin" size={22} />
                        <span>Generating quiz...</span>
                      </>
                    ) : (
                      <>
                        <Play size={22} />
                        <span>Start Quiz</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : quizSubmitted ? (
            /* Results view: all questions */
            <div className="space-y-6">
              {quiz?.questions.map((pytanie: QuizQuestion, index: number) => (
                <div
                  key={index}
                  className={`border-2 rounded-xl p-5 sm:p-6 transition-all ${
                    answers[index] === pytanie.correct_answer
                      ? 'border-emerald-400 bg-gradient-to-br from-emerald-50 to-green-50 shadow-md'
                      : 'border-red-300 bg-gradient-to-br from-red-50 to-pink-50 shadow-md'
                  }`}
                >
                  <h3 className="font-bold text-lg sm:text-xl mb-5 text-gray-800">
                    <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg mr-3 font-bold">
                      {index + 1}
                    </span>
                    {pytanie.question}
                  </h3>
                  <div className="space-y-3">
                    {pytanie.answers.map((odpowiedz, answerIndex) => {
                      const isSelected = answers[index] === answerIndex;
                      const isCorrect = answerIndex === pytanie.correct_answer;
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
                  {pytanie.explanation && (
                    <div className="mt-5 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                      <p className="text-sm font-semibold text-indigo-900 mb-1">
                        💡 Explanation:
                      </p>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {pytanie.explanation}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Active quiz: one question at a time */
            quiz && currentQuestionIndex < quiz.questions.length && (
              <div className="space-y-6">
              <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-gray-700">
                      Question {currentQuestionIndex + 1} of {quiz.questions.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-100 to-red-100 rounded-full border-2 border-orange-300">
                    <Clock className="text-orange-600" size={20} />
                    <span className="text-xl font-bold text-orange-700 font-mono">
                      {questionTimeLeft !== null ? questionTimeLeft : QUESTION_TIMER_SECONDS}s
                    </span>
                  </div>
                </div>

                {(() => {
                  const pytanie = quiz.questions[currentQuestionIndex];
                  const index = currentQuestionIndex;
                  const selectedAnswer = answers[index];

                  return (
                    <div className="border-2 border-gray-200 bg-white rounded-xl p-5 sm:p-6 shadow-lg">
                      <h3 className="font-bold text-lg sm:text-xl mb-6 text-gray-800">
                        {pytanie.question}
                      </h3>
                      <div className="space-y-3 mb-6">
                        {pytanie.answers.map((odpowiedz, answerIndex) => {
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

                      {/* Navigation buttons */}
                      <div className="flex justify-between gap-4 pt-4 border-t border-gray-200">
                        <button
                          onClick={handleSkipQuestion}
                          disabled={loading}
                          className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Skip
                        </button>
                        <button
                          onClick={handleNextQuestion}
                          disabled={loading}
                          className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
                        >
                          {currentQuestionIndex >= quiz.questions.length - 1
                            ? 'Finish Quiz'
                            : 'Next question →'}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )
          )}

          {/* Quiz result summary */}
          {quizSubmitted && quizResult && (
            <div className="mt-8 text-center py-8 sm:py-12 space-y-6 bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 border-2 border-gray-200">
              {quizResult.passed ? (
                <>
                  <div className="text-7xl sm:text-8xl mb-6 animate-bounce">
                    🎉
                  </div>
                  <h3 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent mb-3">
                    Congratulations! You passed!
                  </h3>
                  <div className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-100 rounded-full mb-4">
                    <span className="text-2xl font-black text-emerald-700">
                      {quizResult.score}/{quizResult.totalQuestions || 10}
                    </span>
                    <span className="text-emerald-700 font-semibold">
                      correct answers
                    </span>
                  </div>
                  {quizResult.rewardMinutes && quizResult.rewardMinutes > 0 && (
                    <div className="bg-gradient-to-br from-yellow-400 via-orange-500 to-pink-500 text-white rounded-2xl p-6 sm:p-8 shadow-2xl transform hover:scale-105 transition-transform">
                      <p className="text-3xl sm:text-4xl font-black mb-2">
                        +{quizResult.rewardMinutes} minutes
                      </p>
                      <p className="text-lg font-semibold opacity-95">
                        of phone time! 📱
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
                    You didn’t pass
                  </h3>
                  <div className="inline-flex items-center gap-2 px-6 py-3 bg-red-100 rounded-full mb-4">
                    <span className="text-2xl font-black text-red-700">
                      {quizResult.score}/{quizResult.totalQuestions || 10}
                    </span>
                    <span className="text-red-700 font-semibold">
                      correct answers
                    </span>
                  </div>
                  <div className="max-w-md mx-auto space-y-3">
                    <p className="text-gray-700 font-medium">
                      You need at least{' '}
                      <span className="font-bold text-emerald-600">
                        {quizResult.passingScore || 9}/{quizResult.totalQuestions || 10}
                      </span>{' '}
                      to pass.
                    </p>
                    <div className="bg-orange-100 border-2 border-orange-300 rounded-xl p-4">
                      <p className="text-orange-800 font-semibold">
                        ⏱️ The quiz will be locked for {COOLDOWN_MINUTES} minutes.
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
                  Back to materials
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


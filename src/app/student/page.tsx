import { getMaterials, type Material } from '@/lib/materials';
import { getTotalRewards } from '@/lib/rewards';
import { checkMaterialPassed } from '@/lib/quiz';
import { estimateMaterialDuration } from '@/lib/utils';
import Link from 'next/link';
import { Youtube, FileText, CheckCircle2, Clock, Lock, Trophy, Settings } from 'lucide-react';

// Wymusza renderowanie w runtime (nie podczas buildu) - strony wymagają połączenia z bazą danych
export const dynamic = 'force-dynamic';

async function getMaterialStatus(materialId: string): Promise<'completed' | 'available' | 'cooldown'> {
  const passed = await checkMaterialPassed(materialId);
  if (passed) {
    return 'completed';
  }
  // Dla uproszczenia, jeśli nie zaliczono, zawsze dostępne (cooldown sprawdzamy na stronie materiału)
  return 'available';
}

export default async function StudentDashboard() {
  const materials = await getMaterials();
  const totalRewards = await getTotalRewards();

  // Pobierz status dla każdego materiału
  const materialsWithStatus = await Promise.all(
    materials.map(async (material) => ({
      ...material,
      status: await getMaterialStatus(material.id),
    }))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Nagłówek z licznikiem nagród */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl p-6 sm:p-8 mb-6 sm:mb-8 border border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                Witaj w BrainGain! 🎓
              </h1>
              <p className="text-gray-600 text-sm sm:text-base">
                Ucz się, rozwiązuj quizy i zdobywaj czas na telefon! 📱
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
              <Link
                href="/admin"
                className="px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 font-semibold text-sm sm:text-base"
              >
                <Settings size={18} />
                Panel Admina
              </Link>
              <div className="bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600 text-white px-6 sm:px-8 py-5 sm:py-6 rounded-2xl shadow-lg transform hover:scale-105 transition-transform duration-200">
                <div className="text-xs sm:text-sm font-semibold opacity-95 mb-1 uppercase tracking-wide">
                  Zgromadzone minuty na telefon
                </div>
                <div className="text-3xl sm:text-4xl lg:text-5xl font-black">
                  {totalRewards}
                  <span className="text-xl sm:text-2xl ml-1 opacity-90">min</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lista materiałów */}
        <div className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Dostępne materiały
          </h2>
          <p className="text-gray-600 text-sm sm:text-base">
            {materialsWithStatus.length === 0
              ? 'Brak materiałów'
              : `${materialsWithStatus.length} ${materialsWithStatus.length === 1 ? 'materiał' : 'materiałów'}`}
          </p>
        </div>

        {materialsWithStatus.length === 0 ? (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-8 sm:p-12 text-center border border-gray-200">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-gray-600 text-base sm:text-lg font-medium">
              Brak dostępnych materiałów
            </p>
            <p className="text-gray-500 text-sm mt-2">
              Administrator musi dodać materiały w panelu administracyjnym.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {materialsWithStatus.map((material) => {
              const duration = estimateMaterialDuration(
                material.content_text,
                material.type
              );
              return (
                <Link
                  key={material.id}
                  href={`/student/material/${material.id}`}
                  className="block group"
                >
                  <div
                    className={`bg-white/90 backdrop-blur-sm rounded-2xl shadow-md p-5 sm:p-6 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 ${
                      material.status === 'completed'
                        ? 'border-2 border-emerald-400 bg-gradient-to-br from-emerald-50/50 to-white'
                        : material.status === 'cooldown'
                        ? 'border-2 border-orange-300 opacity-80'
                        : 'border-2 border-transparent hover:border-indigo-300 bg-gradient-to-br from-white to-indigo-50/30'
                    }`}
                  >
                    {/* Ikona typu i tytuł */}
                    <div className="flex items-start gap-3 mb-4">
                      <div
                        className={`flex-shrink-0 p-3 rounded-xl ${
                          material.type === 'youtube'
                            ? 'bg-red-100 group-hover:bg-red-200'
                            : 'bg-blue-100 group-hover:bg-blue-200'
                        } transition-colors`}
                      >
                        {material.type === 'youtube' ? (
                          <Youtube
                            className={`${
                              material.type === 'youtube'
                                ? 'text-red-600'
                                : 'text-blue-600'
                            }`}
                            size={28}
                          />
                        ) : (
                          <FileText
                            className="text-blue-600"
                            size={28}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base sm:text-lg text-gray-800 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                          {material.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            {material.type === 'youtube' ? '📹 Wideo' : '📄 PDF'}
                          </span>
                          <span className="text-gray-300">•</span>
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <Clock size={14} />
                            <span className="font-semibold">{duration} min</span>
                          </div>
                          {material.reward_minutes && material.reward_minutes > 0 && (
                            <>
                              <span className="text-gray-300">•</span>
                              <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                                <Trophy size={14} />
                                <span>+{material.reward_minutes} min</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2 mb-4">
                      {material.status === 'completed' ? (
                        <>
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 rounded-full">
                            <CheckCircle2 className="text-emerald-600" size={18} />
                            <span className="text-emerald-700 font-semibold text-sm">
                              Zaliczone
                            </span>
                          </div>
                        </>
                      ) : material.status === 'cooldown' ? (
                        <>
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 rounded-full">
                            <Clock className="text-orange-600" size={18} />
                            <span className="text-orange-700 font-semibold text-sm">
                              Zablokowane
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-100 rounded-full">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                            <span className="text-indigo-700 font-semibold text-sm">
                              Do zrobienia
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Informacje dodatkowe */}
                    <div className="pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        Dodano:{' '}
                        {new Date(material.created_at).toLocaleDateString('pl-PL', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


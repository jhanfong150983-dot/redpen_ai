import { useSeatController } from '@/hooks/useSeatController'
import { Mic, MicOff, SkipForward, RotateCcw, AlertCircle } from 'lucide-react'

/**
 * 座號控制器演示頁面
 */
export default function SeatControllerDemo() {
  const {
    currentSeat,
    nextSeat,
    jumpToSeat,
    resetSeat,
    isListening,
    startListening,
    stopListening,
    isSupported,
    error
  } = useSeatController({
    maxSeat: 30,
    autoStart: false,
    onSeatChange: (seat) => {
      console.log('座號切換到:', seat)
    }
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* 標題 */}
        <div className="text-center mb-8 mt-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            座號控制器測試
          </h1>
          <p className="text-gray-600">
            使用按鈕或語音控制座號
          </p>
        </div>

        {/* 當前座號顯示 */}
        <div className="bg-white rounded-2xl shadow-xl p-12 mb-6">
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-2">當前座號</p>
            <div className="text-8xl font-bold text-blue-600 mb-4">
              {currentSeat}
            </div>
            <div className="text-gray-400 text-sm">
              共 30 位學生
            </div>
          </div>
        </div>

        {/* 控制按鈕 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={nextSeat}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white py-4 rounded-xl hover:bg-blue-700 transition-colors font-medium text-lg"
          >
            <SkipForward className="w-5 h-5" />
            下一位
          </button>

          <button
            onClick={resetSeat}
            className="flex items-center justify-center gap-2 bg-gray-600 text-white py-4 rounded-xl hover:bg-gray-700 transition-colors font-medium text-lg"
          >
            <RotateCcw className="w-5 h-5" />
            重置
          </button>
        </div>

        {/* 語音控制區域 */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Mic className="w-5 h-5" />
            語音控制
          </h3>

          {/* 瀏覽器支援檢查 */}
          {!isSupported && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  您的瀏覽器不支援語音識別功能。
                  <br />
                  建議使用 Chrome、Edge 或其他基於 Chromium 的瀏覽器。
                </div>
              </div>
            </div>
          )}

          {/* 錯誤訊息 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800">{error}</div>
              </div>
            </div>
          )}

          {/* 語音控制按鈕 */}
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={!isSupported}
            className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl font-medium text-lg transition-all ${
              isListening
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                : 'bg-green-600 hover:bg-green-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isListening ? (
              <>
                <MicOff className="w-6 h-6" />
                停止監聽
              </>
            ) : (
              <>
                <Mic className="w-6 h-6" />
                開始語音識別
              </>
            )}
          </button>

          {/* 監聽狀態提示 */}
          {isListening && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 bg-red-50 text-red-700 px-4 py-2 rounded-full text-sm">
                <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                正在監聽... 請說出座號
              </div>
            </div>
          )}

          {/* 使用說明 */}
          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">
              💡 使用說明：
            </p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• 點擊「開始語音識別」啟用麥克風</li>
              <li>• 說出座號數字，例如：「5」、「十五」、「二十三」</li>
              <li>• 系統會自動跳轉到對應座號</li>
              <li>• 支援阿拉伯數字和中文數字</li>
            </ul>
          </div>
        </div>

        {/* 快速跳轉 */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h3 className="text-lg font-semibold mb-4">快速跳轉</h3>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 30 }, (_, i) => i + 1).map((seat) => (
              <button
                key={seat}
                onClick={() => jumpToSeat(seat)}
                className={`py-3 rounded-lg font-medium transition-colors ${
                  currentSeat === seat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {seat}
              </button>
            ))}
          </div>
        </div>

        {/* 開發者資訊 */}
        <div className="mt-6 text-center text-sm text-gray-500">
          按 F12 開啟控制台查看語音識別詳細資訊
        </div>
      </div>
    </div>
  )
}

/**
 * 教学拖曳动画组件
 * 显示幽灵游标从起始位置拖曳到目标位置的动画
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface TutorialDragAnimationProps {
  fromSelector: string
  toSelector: string
}

export function TutorialDragAnimation({ fromSelector, toSelector }: TutorialDragAnimationProps) {
  const [fromRect, setFromRect] = useState<DOMRect | null>(null)
  const [toRect, setToRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const updatePositions = () => {
      const fromElement = document.querySelector(fromSelector)
      const toElement = document.querySelector(toSelector)

      if (fromElement && toElement) {
        setFromRect(fromElement.getBoundingClientRect())
        setToRect(toElement.getBoundingClientRect())
      }
    }

    updatePositions()

    // 监听窗口调整
    window.addEventListener('resize', updatePositions)
    window.addEventListener('scroll', updatePositions, true)

    return () => {
      window.removeEventListener('resize', updatePositions)
      window.removeEventListener('scroll', updatePositions, true)
    }
  }, [fromSelector, toSelector])

  if (!fromRect || !toRect) {
    return null
  }

  // 计算起点和终点位置（元素中心）
  const startX = fromRect.left + fromRect.width / 2
  const startY = fromRect.top + fromRect.height / 2
  const endX = toRect.left + toRect.width / 2
  const endY = toRect.top + toRect.height / 2

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-none">
      {/* 幽灵卡片 - 从起始位置移动到目标位置 */}
      <motion.div
        className="absolute w-32 h-20 bg-blue-500/30 border-2 border-blue-500 rounded-lg shadow-lg"
        initial={{
          x: startX - 64, // 64 = width/2
          y: startY - 40, // 40 = height/2
          opacity: 0
        }}
        animate={{
          x: [startX - 64, endX - 64],
          y: [startY - 40, endY - 40],
          opacity: [0, 1, 1, 0.3]
        }}
        transition={{
          duration: 2.5,
          times: [0, 0.2, 0.8, 1],
          repeat: Infinity,
          repeatDelay: 0.5,
          ease: 'easeInOut'
        }}
      />

      {/* 手形游标 */}
      <motion.div
        className="absolute text-4xl"
        initial={{
          x: startX - 12,
          y: startY - 12,
          opacity: 0
        }}
        animate={{
          x: [startX - 12, startX - 12, endX - 12, endX - 12],
          y: [startY - 12, startY - 12, endY - 12, endY - 12],
          opacity: [0, 1, 1, 0],
          scale: [1, 1, 1, 0.8]
        }}
        transition={{
          duration: 2.5,
          times: [0, 0.2, 0.8, 1],
          repeat: Infinity,
          repeatDelay: 0.5,
          ease: 'easeInOut'
        }}
      >
        <span className="filter drop-shadow-lg">👆</span>
      </motion.div>

      {/* 起点提示圆圈 */}
      <motion.div
        className="absolute w-12 h-12 border-2 border-blue-400 rounded-full"
        style={{
          left: startX - 24,
          top: startY - 24
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.8, 0.5]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />

      {/* 终点提示圆圈 */}
      <motion.div
        className="absolute w-12 h-12 border-2 border-green-400 rounded-full"
        style={{
          left: endX - 24,
          top: endY - 24
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.8, 0.5]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.5
        }}
      />

      {/* 虚线路径 */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      >
        <motion.path
          d={`M ${startX} ${startY} Q ${(startX + endX) / 2} ${(startY + endY) / 2 - 50} ${endX} ${endY}`}
          stroke="rgba(59, 130, 246, 0.4)"
          strokeWidth="2"
          fill="none"
          strokeDasharray="5,5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            repeatDelay: 0.5,
            ease: 'easeInOut'
          }}
        />
      </svg>
    </div>
  )
}

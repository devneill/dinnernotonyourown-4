import { useState, useEffect } from 'react'

interface CountdownTimerProps {
  targetTime: Date
}

export function CountdownTimer({ targetTime }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  })
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date()
      const difference = targetTime.getTime() - now.getTime()
      
      if (difference <= 0) {
        setIsExpired(true)
        return { hours: 0, minutes: 0, seconds: 0 }
      }
      
      // Calculate time units
      const hours = Math.floor(difference / (1000 * 60 * 60))
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((difference % (1000 * 60)) / 1000)
      
      return { hours, minutes, seconds }
    }
    
    // Update timer immediately
    setTimeLeft(calculateTimeLeft())
    
    // Set up interval to update the timer
    const timerId = setInterval(() => {
      setTimeLeft(calculateTimeLeft())
    }, 1000)
    
    return () => clearInterval(timerId)
  }, [targetTime])
  
  // Format time digits with leading zeros
  const formatTime = (value: number) => {
    return value < 10 ? `0${value}` : value
  }
  
  return (
    <div className="font-mono">
      {isExpired ? (
        <span className="text-red-500">You're having dinner on your own!</span>
      ) : (
        <>
          <span className="text-muted-foreground mr-2">Time until dinner:</span>
          <span className="text-xl font-bold">
            {formatTime(timeLeft.hours)}:{formatTime(timeLeft.minutes)}:{formatTime(timeLeft.seconds)}
          </span>
        </>
      )}
    </div>
  )
} 
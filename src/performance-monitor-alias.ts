// Export the optimized performance monitor but keep the same interface for compatibility
import { OptimizedPerformanceMonitor } from './optimized-performance-monitor';
import { PerformanceMonitor } from './performance-monitor';

// Create an alias that uses the optimized version but keeps the same interface
export { OptimizedPerformanceMonitor as OptimizedPerformanceMonitorImpl };

// Export the same interface as the original but with optimized implementation
export { performanceMonitor } from './optimized-performance-monitor';
export type { PerformanceMonitor } from './performance-monitor';
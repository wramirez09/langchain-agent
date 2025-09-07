// Performance monitoring utilities
export const measurePerformance = <T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> => {
  return new Promise(async (resolve, reject) => {
    const start = performance.now();
    
    try {
      const result = await fn();
      const end = performance.now();
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`⚡ ${name}: ${(end - start).toFixed(2)}ms`);
      }
      
      resolve(result);
    } catch (error) {
      const end = performance.now();
      
      if (process.env.NODE_ENV === 'development') {
        console.error(`❌ ${name} failed after ${(end - start).toFixed(2)}ms:`, error);
      }
      
      reject(error);
    }
  });
};

// Debounce utility for API calls
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Throttle utility for frequent operations
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

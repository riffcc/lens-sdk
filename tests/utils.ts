export async function waitUntil(
  conditionFn: () => Promise<boolean> | boolean,
  options: { timeout: number; interval: number },
): Promise<void> {
  const { timeout, interval } = options;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        if (await conditionFn()) {
          resolve();
        } else if (Date.now() - startTime >= timeout) {
          reject(new Error(`pollUntil timed out after ${timeout}ms`));
        } else {
          setTimeout(attempt, interval);
        }
      } catch (error) { // If conditionFn throws, retry until timeout
        if (Date.now() - startTime >= timeout) {
          reject(new Error(`pollUntil timed out after ${timeout}ms, last error: ${error}`));
        } else {
          setTimeout(attempt, interval);
        }
      }
    };
    attempt();
  });
}

export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
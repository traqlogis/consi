// pingServer.ts
export const pingServer = async () => {
  const API_BASE_URL = import.meta.env.VITE_API_URL;
      
  try {
    await fetch(`${API_BASE_URL}/api/ping`, {
      method: "GET",
      cache: "no-cache",
    });
    // Optional: Log if needed
    console.log("Ping sent to backend");
  } catch (error) {
    // Fail silently, no need to alert the user
    console.warn("Ping failed", error);
  }
};

export type ApiSuccess<T> = { success: true; data: T; qualityGate?: unknown };
export type ApiFailure = { success: false; error?: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export async function fetchJSON<T = any>(url: string, options?: RequestInit, retryCount = 0): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type");

    if (!res.ok) {
      if ((res.status === 429 || res.status === 503) && retryCount < 2) {
        const retryAfter = Number(res.headers.get("retry-after") || 0);
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : (retryCount + 1) * 1500;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return fetchJSON<T>(url, options, retryCount + 1);
      }
      let errorMessage = `Server error: ${res.status} ${res.statusText}`;
      if (contentType && contentType.includes("application/json")) {
        try {
          const errorJson = await res.json();
          errorMessage = errorJson.error || errorMessage;
        } catch {
          // keep fallback message
        }
      } else {
        const text = await res.text();
        if (text.includes("<title>Starting Server...</title>") && retryCount < 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return fetchJSON<T>(url, options, retryCount + 1);
        }
      }
      throw new Error(errorMessage);
    }

    if (!contentType || !contentType.includes("application/json")) {
      const text = await res.text();
      if (text.includes("<!doctype html>") && retryCount < 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return fetchJSON<T>(url, options, retryCount + 1);
      }
      throw new Error("Invalid response format from server. Please try again.");
    }

    return await res.json();
  } catch (err: any) {
    if (retryCount < 1 && err.message === "Failed to fetch") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return fetchJSON<T>(url, options, retryCount + 1);
    }
    throw err;
  }
}

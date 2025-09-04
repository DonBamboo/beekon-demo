type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

// Environment variable validation
const n8nUrl = import.meta.env.VITE_N8N_URL;
const n8nAuthUser = import.meta.env.VITE_N8N_WEBHOOK_USER;
const n8nAuthPass = import.meta.env.VITE_N8N_WEBHOOK_PASS;

// Validate required environment variables
function validateEnvironmentVariables() {
  const missing = [];
  if (!n8nUrl || n8nUrl === "YOUR_N8N_URL_HERE") missing.push("VITE_N8N_URL");
  if (!n8nAuthUser || n8nAuthUser === "YOUR_N8N_USER_HERE") missing.push("VITE_N8N_WEBHOOK_USER");
  if (!n8nAuthPass || n8nAuthPass === "YOUR_N8N_PASS_HERE") missing.push("VITE_N8N_WEBHOOK_PASS");
  
  if (missing.length > 0) {
    throw new Error(`Missing or invalid environment variables: ${missing.join(", ")}. Please check your .env configuration.`);
  }
}

export type HttpResponse<T = unknown> = {
  success: boolean;
  messages: string[];
  data: T;
};

export function noTrailingSlash(website: string): string {
  return website.replace(/\/+$/, "");
}

export async function sendN8nWebhook(
  endpoint: string,
  body: object | undefined = undefined
): Promise<HttpResponse> {
  try {
    // Validate environment variables before making requests
    validateEnvironmentVariables();
    
    // Input validation
    if (!endpoint || typeof endpoint !== 'string') {
      return {
        success: false,
        messages: ["Invalid endpoint provided"],
        data: null,
      };
    }
    
    // Sanitize endpoint to prevent path traversal
    const sanitizedEndpoint = endpoint.replace(/[^a-zA-Z0-9-_/]/g, '');
    
    const base64Creds = btoa(`${n8nAuthUser}:${n8nAuthPass}`);
    return await httpRequest(
      "POST",
      `${noTrailingSlash(n8nUrl)}/${sanitizedEndpoint}`,
      {
        Authorization: `Basic ${base64Creds}`,
        "Content-Type": "application/json",
      },
      JSON.stringify(body)
    );
  } catch (error) {
    return {
      success: false,
      messages: [error instanceof Error ? error.message : "Unknown error occurred"],
      data: null,
    };
  }
}

export async function httpRequest(
  method: Method,
  url: string,
  requestHeaders: object | undefined,
  body: FormData | string | undefined = undefined
): Promise<HttpResponse> {
  let data: unknown = null;
  const headers: HeadersInit = new Headers();

  // Input validation
  if (!method || !url) {
    return {
      success: false,
      messages: ["Method and URL are required"],
      data: null,
    };
  }

  // URL validation - ensure it's a proper HTTP/HTTPS URL
  const isDevelopment = import.meta.env.DEV || import.meta.env.VITE_DEBUG_MODE === 'true';
  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols are allowed');
    }
    
    // In development, be more permissive with localhost URLs
    if (!isDevelopment && urlObj.protocol === 'http:' && 
        !urlObj.hostname.includes('localhost') && 
        !urlObj.hostname.includes('127.0.0.1') &&
        !urlObj.hostname.startsWith('192.168.')) {
      throw new Error('HTTP protocol only allowed for localhost in production');
    }
  } catch (error) {
    return {
      success: false,
      messages: [isDevelopment ? `URL validation: ${error instanceof Error ? error.message : 'Invalid URL'}` : "Invalid URL provided"],
      data: null,
    };
  }

  // Set security headers
  headers.set('User-Agent', 'Beekon-AI-Client/1.0');
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (requestHeaders) {
    Object.entries(requestHeaders).forEach(([key, value]) => {
      // Sanitize header keys and values
      const sanitizedKey = key.replace(/[^\w-]/g, '');
      const sanitizedValue = typeof value === 'string' ? value.replace(/[\r\n]/g, '') : String(value);
      headers.set(sanitizedKey, sanitizedValue);
    });
  }

  try {
    // Check if we're in development mode
    const isDevelopment = import.meta.env.DEV || import.meta.env.VITE_DEBUG_MODE === 'true';
    
    const options: RequestInit = {
      method: method,
      headers: headers,
      body: body,
      credentials: isDevelopment ? 'same-origin' : 'same-origin', // Allow credentials in development
      mode: 'cors',
      cache: isDevelopment ? 'default' : 'no-cache', // Allow caching in development for better performance
    };

    const response = await fetch(url, options);
    
    // Check content type before parsing JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    return {
      success: false,
      messages: [error instanceof Error ? error.message : String(error)],
      data: data,
    };
  }

  return {
    success: true,
    messages: ["success"],
    data: data,
  };
}

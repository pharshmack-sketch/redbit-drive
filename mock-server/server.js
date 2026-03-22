/**
 * RedBit Drive — Mock Server
 * 
 * Простой HTTP-сервер для тестирования без реального backend.
 * Эмулирует REST API + Supabase-совместимые эндпоинты.
 * 
 * Запуск: node mock-server/server.js
 *         или: npm run mock
 */

const http = require("http");
const crypto = require("crypto");

const PORT = 3001;

// ── Хранилище состояния в памяти ─────────────────────────────────────────
const state = {
  users: [
    { id: "u1", email: "admin@redbit.io", full_name: "Admin User", role: "admin", created_at: new Date(Date.now() - 86400000 * 30).toISOString() },
    { id: "u2", email: "user@redbit.io", full_name: "Demo User", role: "executor", created_at: new Date(Date.now() - 86400000 * 10).toISOString() },
    { id: "u3", email: "client@redbit.io", full_name: "Client One", role: "client", created_at: new Date(Date.now() - 86400000 * 5).toISOString() },
  ],
  files: [
    {
      id: "f1", user_id: "u1", file_name: "Документы", file_url: null,
      file_size: 0, file_type: null, is_folder: true, folder_id: null,
      source: "upload", storage_backend: "supabase", s3_key: null,
      is_public: false, share_password: null,
      created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
    {
      id: "f2", user_id: "u1", file_name: "presentation.pdf",
      file_url: "https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf",
      file_size: 1200000, file_type: "application/pdf", is_folder: false,
      folder_id: null, source: "upload", storage_backend: "supabase", s3_key: null,
      is_public: true, share_password: null,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: "f3", user_id: "u1", file_name: "photo.jpg",
      file_url: "https://picsum.photos/400/300",
      file_size: 890000, file_type: "image/jpeg", is_folder: false,
      folder_id: null, source: "ai_generation", storage_backend: "s3", s3_key: "personal/photo.jpg",
      is_public: false, share_password: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "f4", user_id: "u1", file_name: "report.xlsx",
      file_url: "https://example.com/report.xlsx",
      file_size: 456000, file_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      is_folder: false, folder_id: null, source: "project", storage_backend: "supabase", s3_key: null,
      is_public: false, share_password: null,
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
  ],
  sessions: {},
};

// ── Утилиты ──────────────────────────────────────────────────────────────
function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

function getBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { resolve({}); }
    });
  });
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  return auth.replace("Bearer ", "");
}

function getUser(req) {
  const token = getToken(req);
  return state.sessions[token] || null;
}

function slugify() {
  return crypto.randomUUID();
}

// ── Роутер ───────────────────────────────────────────────────────────────
const routes = {
  // ── Auth ────────────────────────────────────────────────────────────
  "POST /auth/v1/token": async (req, res) => {
    const body = await getBody(req);
    const user = state.users.find((u) => u.email === body.email);
    
    if (!user || (body.password !== "demo" && body.password !== "admin")) {
      return send(res, 400, { error: "Invalid credentials", error_description: "Неверный email или пароль" });
    }

    const token = `mock-token-${slugify()}`;
    state.sessions[token] = user;
    send(res, 200, {
      access_token: token,
      token_type: "bearer",
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: { full_name: user.full_name, role: user.role },
      },
    });
  },

  "DELETE /auth/v1/logout": (req, res) => {
    const token = getToken(req);
    delete state.sessions[token];
    send(res, 204, {});
  },

  "GET /auth/v1/user": (req, res) => {
    const user = getUser(req);
    if (!user) return send(res, 401, { error: "Unauthorized" });
    send(res, 200, {
      id: user.id,
      email: user.email,
      user_metadata: { full_name: user.full_name, role: user.role },
    });
  },

  // ── Files ────────────────────────────────────────────────────────────
  "GET /api/files": (req, res, query) => {
    const user = getUser(req);
    if (!user) return send(res, 401, { error: "Unauthorized" });
    
    const folderId = query.folder_id || null;
    const files = state.files.filter((f) => {
      if (f.user_id !== user.id) return false;
      if (folderId) return f.folder_id === folderId;
      return !f.folder_id;
    });
    
    send(res, 200, { data: files.sort((a, b) =>
      (b.is_folder ? 1 : 0) - (a.is_folder ? 1 : 0) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )});
  },

  "POST /api/files": async (req, res) => {
    const user = getUser(req);
    if (!user) return send(res, 401, { error: "Unauthorized" });
    const body = await getBody(req);
    
    const file = {
      id: slugify(),
      user_id: user.id,
      file_name: body.file_name || "Untitled",
      file_url: body.file_url || null,
      file_size: body.file_size || 0,
      file_type: body.file_type || null,
      is_folder: body.is_folder || false,
      folder_id: body.folder_id || null,
      source: body.source || "upload",
      storage_backend: body.storage_backend || "supabase",
      s3_key: body.s3_key || null,
      is_public: false,
      share_password: null,
      created_at: new Date().toISOString(),
    };
    state.files.push(file);
    send(res, 201, { data: file });
  },

  "PUT /api/files/:id": async (req, res, _query, params) => {
    const user = getUser(req);
    if (!user) return send(res, 401, { error: "Unauthorized" });
    const body = await getBody(req);
    
    const idx = state.files.findIndex((f) => f.id === params.id && f.user_id === user.id);
    if (idx < 0) return send(res, 404, { error: "Not found" });
    
    state.files[idx] = { ...state.files[idx], ...body };
    send(res, 200, { data: state.files[idx] });
  },

  "DELETE /api/files/:id": (req, res, _query, params) => {
    const user = getUser(req);
    if (!user) return send(res, 401, { error: "Unauthorized" });
    
    const idx = state.files.findIndex((f) => f.id === params.id && f.user_id === user.id);
    if (idx < 0) return send(res, 404, { error: "Not found" });
    
    state.files.splice(idx, 1);
    send(res, 200, { data: { success: true } });
  },

  "GET /api/files/search": (req, res, query) => {
    const user = getUser(req);
    if (!user) return send(res, 401, { error: "Unauthorized" });
    
    const q = (query.q || "").toLowerCase();
    const results = state.files.filter(
      (f) => f.user_id === user.id && f.file_name.toLowerCase().includes(q)
    );
    send(res, 200, { data: results });
  },

  "GET /api/files/stats": (req, res) => {
    const user = getUser(req);
    if (!user) return send(res, 401, { error: "Unauthorized" });
    
    const userFiles = state.files.filter((f) => f.user_id === user.id && !f.is_folder);
    const usedBytes = userFiles.reduce((s, f) => s + f.file_size, 0);
    send(res, 200, {
      data: {
        usedBytes,
        quotaBytes: 10 * 1024 * 1024 * 1024,
        fileCount: userFiles.length,
      },
    });
  },

  // ── S3 Storage Proxy (эмуляция) ─────────────────────────────────────
  //
  // Эмулирует единую точку входа /api/storage/presign — именно через неё
  // десктопный клиент запрашивает presigned URL.
  // В production эти запросы идут к app.pxbt.io, который проксирует их
  // к Supabase Edge Function s3-presign.
  //
  // Поддерживаемые action:
  //   presign          — simple PUT upload
  //   createMultipart  — начать multipart upload
  //   signPart         — подписать часть
  //   completeMultipart— завершить multipart
  //   abortMultipart   — отменить multipart
  //   getObject        — presigned GET (для скачивания)
  //   delete           — удалить файлы
  //
  // Все эти роуты имитируют логику реального Edge Function s3-presign.

  "POST /functions/v1/s3-presign": async (req, res) => {
    const body = await getBody(req);
    const action = body.action || "presign";

    // Simple presign (PUT)
    if (action === "presign") {
      const key = (body.path || `personal/${slugify()}`).replace(/^\/+/, "");
      send(res, 200, {
        presignedUrl: `http://localhost:${PORT}/mock-s3/${key}`,
        publicUrl:    `http://localhost:${PORT}/mock-s3/${key}`,
        key,
      });
      return;
    }

    // Create multipart upload
    if (action === "createMultipart") {
      const key = (body.path || `personal/${slugify()}`).replace(/^\/+/, "");
      send(res, 200, {
        uploadId:  `mock-upload-${slugify()}`,
        key,
        publicUrl: `http://localhost:${PORT}/mock-s3/${key}`,
      });
      return;
    }

    // Sign part
    if (action === "signPart") {
      const { key, uploadId, partNumber } = body;
      send(res, 200, {
        presignedUrl: `http://localhost:${PORT}/mock-s3/${key}?partNumber=${partNumber}&uploadId=${uploadId}`,
      });
      return;
    }

    // Complete multipart
    if (action === "completeMultipart") {
      const { key } = body;
      send(res, 200, {
        success: true,
        url: `http://localhost:${PORT}/mock-s3/${key}`,
        key,
      });
      return;
    }

    // Abort multipart
    if (action === "abortMultipart") {
      send(res, 200, { success: true });
      return;
    }

    // Presigned GET (download)
    if (action === "getObject") {
      const { key, expiresIn = 3600 } = body;
      send(res, 200, {
        presignedUrl: `http://localhost:${PORT}/mock-s3/${key}?expires=${Date.now() + expiresIn * 1000}`,
      });
      return;
    }

    // Delete files
    if (action === "delete") {
      const keys = Array.isArray(body.keys) ? body.keys : [];
      console.log("[Mock S3] Deleted keys:", keys);
      send(res, 200, { success: true, deleted: keys.length });
      return;
    }

    send(res, 400, { error: `Unknown action: ${action}` });
  },

  // Mock S3 upload endpoint — принимает PUT запросы с файлами
  "PUT /mock-s3/:key": (req, res) => {
    const etag = `"mock-etag-${Date.now()}"`;
    res.writeHead(200, { "ETag": etag, "Content-Length": "0" });
    req.resume();
    req.on("end", () => res.end());
  },

  // ── Admin ────────────────────────────────────────────────────────────
  "GET /api/admin/users": (req, res) => {
    const user = getUser(req);
    if (!user || user.role !== "admin") return send(res, 403, { error: "Forbidden" });
    send(res, 200, { data: state.users });
  },

  "PUT /api/admin/users/:id": async (req, res, _query, params) => {
    const user = getUser(req);
    if (!user || user.role !== "admin") return send(res, 403, { error: "Forbidden" });
    const body = await getBody(req);
    
    const idx = state.users.findIndex((u) => u.id === params.id);
    if (idx < 0) return send(res, 404, { error: "Not found" });
    state.users[idx] = { ...state.users[idx], ...body };
    send(res, 200, { data: state.users[idx] });
  },

  "DELETE /api/admin/users/:id": (req, res, _query, params) => {
    const user = getUser(req);
    if (!user || user.role !== "admin") return send(res, 403, { error: "Forbidden" });
    
    const idx = state.users.findIndex((u) => u.id === params.id);
    if (idx < 0) return send(res, 404, { error: "Not found" });
    state.users.splice(idx, 1);
    send(res, 200, { data: { success: true } });
  },

  "GET /api/admin/stats": (req, res) => {
    const user = getUser(req);
    if (!user || user.role !== "admin") return send(res, 403, { error: "Forbidden" });
    
    const allFiles = state.files.filter((f) => !f.is_folder);
    send(res, 200, {
      data: {
        totalUsers: state.users.length,
        totalFiles: allFiles.length,
        totalBytes: allFiles.reduce((s, f) => s + f.file_size, 0),
      },
    });
  },
};

// ── HTTP сервер ───────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const query = Object.fromEntries(url.searchParams);
  const method = req.method;

  // Ищем совпадение маршрута
  for (const [route, handler] of Object.entries(routes)) {
    const [routeMethod, routePath] = route.split(" ");
    if (routeMethod !== method) continue;

    // Парсим параметры пути (/:id и т.п.)
    const params = {};
    const routeParts = routePath.split("/");
    const pathParts = pathname.split("/");

    if (routeParts.length !== pathParts.length) continue;

    let match = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(":")) {
        params[routeParts[i].slice(1)] = pathParts[i];
      } else if (routeParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      try {
        await handler(req, res, query, params);
      } catch (err) {
        console.error(`Error in ${route}:`, err);
        send(res, 500, { error: "Internal Server Error", message: err.message });
      }
      return;
    }
  }

  send(res, 404, { error: "Not Found", path: pathname });
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║     RedBit Drive — Mock Server           ║
║     http://localhost:${PORT}                ║
╠══════════════════════════════════════════╣
║  Тестовые аккаунты:                      ║
║  admin@redbit.io  / demo  (admin)        ║
║  user@redbit.io   / demo  (executor)     ║
║  client@redbit.io / demo  (client)       ║
╚══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => { server.close(); process.exit(0); });

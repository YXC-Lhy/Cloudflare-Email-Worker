// worker.js
const username = "admin";
const password = "adminsuperpwd";
const token = "agsnasgs4rhshsere65i6dhdh";
const domain = "example.com";
import html from './index.html';
export default {
  // -----------------------------
  // 1️⃣ 接收邮件
  // -----------------------------
  async email(message, env, ctx) {
    try {
      let sender = message.headers.get("from") || "";
      // 去掉所有引号
      sender = sender.replace(/"/g, "").trim();
      const real_sender = message.from;
      let receiver = message.to;
      receiver = receiver.replace(/"/g, "").trim();
      let subject = message.headers.get("subject") || "(無標題)";
      const raw = await new Response(message.raw).text();
      const mimeMatch = subject.match(
        /=\?([^?]+)\?([BbQq])\?([^?]+)\?=/
      );
      if (mimeMatch) {
        const [, charset, encoding, content] = mimeMatch;
        subject = decodeMailContent(
          content,
          encoding === "B" || encoding === "b"
            ? "base64"
            : "quoted-printable",
          charset
        );
      }
      function decodeBase64Mail(base64) {
        const binary = atob(
          base64
            .replace(/\r/g, "")
            .replace(/\n/g, "")
            .replace(/\s/g, "")
            .trim()
        );
        const bytes = Uint8Array.from(
          binary,
          c => c.charCodeAt(0)
        );
        return new TextDecoder("utf-8").decode(bytes);
      }

    function decodeMailContent(content, encoding, charset = "utf-8") {
        encoding = (encoding || "").toLowerCase();
        charset = (charset || "utf-8").toLowerCase();
        // base64
        if (encoding === "base64") {
          const binary = atob(content.replace(/\r?\n/g, ""));
          const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
          return new TextDecoder(charset).decode(bytes);
        }
        // quoted-printable
        if (encoding === "quoted-printable") {
          content = content.replace(/=\r?\n/g, "");
          const bytes = [];
          for (let i = 0; i < content.length; i++) {
            if (content[i] === "=" && /^[0-9A-F]{2}$/i.test(content.substring(i + 1, i + 3))) {
              bytes.push(parseInt(content.substring(i + 1, i + 3), 16));
              i += 2;
            } else {
              bytes.push(content.charCodeAt(i));
            }
          }
          return new TextDecoder(charset).decode(new Uint8Array(bytes));
        }
        // 7bit, 8bit, binary
        return content;
      }
      
      function extractBody(raw) {
        function splitMimeParts(raw) {
          const match = raw.match(
            /boundary="?([^"\r\n;]+)"?/i
          );
          if (!match) {
            return [raw];
          }
          const boundary = match[1];
          const escaped = boundary.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );
          const regex = new RegExp(
            `--${escaped}(?:--)?\\r?\\n`,
            "g"
          );
          return raw
            .split(regex)
            .map(v => v.trim())
            .filter(Boolean);
        }
        // 简单拆分多部分邮件
        const parts = splitMimeParts(raw);

        let html = null;
        let text = null;

        for (const part of parts) {
          const ctMatch = part.match(/Content-Type:\s*([^\s;]+)(?:;\s*charset="?([^\s";]+)"?)?/i);
          const ceMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);

          if (!ctMatch) continue;

          const type = ctMatch[1].toLowerCase();
          const charset = ctMatch[2] || "utf-8";
          const encoding = ceMatch ? ceMatch[1] : "7bit";

          // 找正文内容
          const bodyMatch = part.split(/\r?\n\r?\n/).slice(1).join("\n\n");
          if (!bodyMatch) continue;

          const decoded = decodeMailContent(bodyMatch.trim(), encoding, charset);

          if (type.includes("html") && !html) html = decoded;
          else if (type.includes("plain") && !text) text = decoded;
        }

        // 如果没有 multipart，尝试直接解析
        if (!html && !text) {
          const ctMatch = raw.match(/Content-Type:\s*([^\s;]+)(?:;\s*charset="?([^\s";]+)"?)?/i);
          const ceMatch = raw.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
          const encoding = ceMatch ? ceMatch[1] : "7bit";
          const charset = ctMatch ? ctMatch[2] : "utf-8";
          text = decodeMailContent(raw, encoding, charset);
        }

        return html || text || "(empty)";
      }

      const body = extractBody(raw);
      // 最后兜底
      //if (!body) {
      //  body = raw;
      //}
      // 忽略附件
      if (message.attachments && message.attachments.length > 0) {
        console.log("Attachment ignored");
      }

      // 存入 D1
      await env.DB.prepare(`
        INSERT INTO emails (sender,real_sender, receiver, subject, body, received_at)
        VALUES (?,?, ?, ?, ?, ?)
      `)
      .bind(sender,real_sender, receiver, subject, body, new Date().toISOString())
      .run();

      // 保留最近 200 封
      const countRes = await env.DB.prepare(`SELECT COUNT(*) AS total FROM emails`).first();
      const total = Number(countRes.total);
      if (total > 200) {
        const remove = total - 200;
        await env.DB.prepare(`
          DELETE FROM emails
          WHERE id IN (
            SELECT id FROM emails ORDER BY id ASC LIMIT ?
          )
        `).bind(remove).run();
      }

    } catch (e) {
      console.error("Email Worker Error:", e);
      message.setReject("Failed processing email");
    }
  },

  // -----------------------------
  // 2️⃣ HTTP API
  // -----------------------------
  async fetch(request, env) {
    function checkToken(request) {
      const tokenu =
        request.headers.get("Authorization")?.replace("Bearer ", "") ||
        request.headers.get("X-Token") ||
        "";

      return tokenu === token;
    }
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(html, {
      headers: { "Content-Type": "text/html;charset=UTF-8" }
    });
    }
    if (url.pathname.includes('%')) {
      // 解码路径
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(url.pathname);
        if (decodedPath.startsWith("/")) {
            decodedPath = decodedPath.slice(1);
        }
      } catch (e) {
        return new Response("无法解码 URL", { status: 400 });
      }

      // 可以返回一个提示页面
      return new Response(`
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
      <meta charset="UTF-8">
      <title>外部链接</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f5f6fa;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
        }
        .card {
          background: #fff;
          padding: 24px 32px;
          border-radius: 16px;      /* 圆角框 */
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          text-align: center;
          width: 50%;
        }
        .btn {
          display: inline-block;
          margin-top: 16px;
          padding: 10px 24px;
          border: none;
          border-radius: 12px;      /* 圆角按钮 */
          background-color: #2563eb;
          color: white;
          font-size: 14px;
          cursor: pointer;
          text-decoration: none;
        }
        .btn:hover {
          background-color: #1d4ed8;
        }
      </style>
      </head>
      <body>
        <div class="card">
          <h2>邮件包含外部链接</h2>
          <p>外部链接：<strong>${decodedPath}</strong></p>
          <p>请谨慎访问！</p>
          <a class="btn" href="${decodedPath}">打开链接</a>
        </div>
      </body>
      </html>
      `, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }
    if (
      request.method === "POST" &&
      url.pathname === "/login"
    ) {
      const data = await request.json();
      if(username==data.username&&password == data.password){
        return Response.json({success: true, token:token});
      }
      return Response.json({success: false});
    }

    if (!checkToken(request)) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 发邮件接口
    if (request.method === "POST" && url.pathname === "/send") {
      return sendEmail(request, env);
    }
    
    // 邮件列表
    if (request.method === "GET" && url.pathname === "/emails") {
      return getEmailList(env);
    }
    // 邮件列表
    if (request.method === "GET" && url.pathname === "/sent") {
      return getSentList(env);
    }

    // 单封邮件
    if (request.method === "GET" && url.pathname.startsWith("/email/")) {
      const id = url.pathname.split("/")[2];
      return getEmail(id, env);
    }
    // 单封邮件
    if (request.method === "GET" && url.pathname.startsWith("/sent/")) {
      const id = url.pathname.split("/")[2];
      return getSent(id, env);
    }

    return new Response("Not Found", { status: 404 });
  }
};

// -----------------------------
// 发邮件
// -----------------------------
async function sendEmail(request, env) {
  try {
    const data = await request.json();

    const { to, subject, body , flom} = data;

    if (!to || !subject || !body || !flom) {
      return new Response(JSON.stringify({ success: false, error: "Missing parameters" }), { status: 400 });
    }
    let f = flom+"@"+domain;
    await env.EMAIL.send({
      from: f, // 根据你的 EMAIL Routing 配置
      to,
      subject,
      text: body
    });
    // 存入 D1
    await env.DB.prepare(`
      INSERT INTO sends (sender, receiver, subject, body, sent_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(f, to, subject, body, new Date().toISOString())
    .run();
    // 保留最近 200 封
    const countRes = await env.DB.prepare(`SELECT COUNT(*) AS total FROM sends`).first();
    const total = Number(countRes.total);
    if (total > 200) {
      const remove = total - 200;
      await env.DB.prepare(`
        DELETE FROM sends
        WHERE id IN (
          SELECT id FROM sends ORDER BY id ASC LIMIT ?
        )
      `).bind(remove).run();
    }
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
  }
}

// -----------------------------
// 邮件列表
// -----------------------------
async function getEmailList(env) {
  const result = await env.DB.prepare(`
    SELECT id, sender, receiver, subject, received_at
    FROM emails
    ORDER BY id DESC
  `).all();

  return new Response(JSON.stringify({
    success: true,
    total: result.results.length,
    emails: result.results
  }), { headers: { "Content-Type": "application/json" } });
}
// -----------------------------
// 邮件列表
// -----------------------------
async function getSentList(env) {
  const result = await env.DB.prepare(`
    SELECT id, sender, receiver, subject, sent_at
    FROM sends
    ORDER BY id DESC
  `).all();

  return new Response(JSON.stringify({
    success: true,
    total: result.results.length,
    emails: result.results
  }), { headers: { "Content-Type": "application/json" } });
}

// -----------------------------
// 单封邮件
// -----------------------------
async function getEmail(id, env) {
  const result = await env.DB.prepare(`
    SELECT id, sender, receiver, subject, body, received_at
    FROM emails
    WHERE id = ?
  `).bind(id).first();

  if (!result) {
    return new Response(JSON.stringify({ success: false, error: "Email not found" }), { status: 404 });
  }

  return new Response(JSON.stringify({ success: true, email: result }), { headers: { "Content-Type": "application/json" } });
}
// -----------------------------
// 单封邮件
// -----------------------------
async function getSent(id, env) {
  const result = await env.DB.prepare(`
    SELECT id, sender, receiver, subject, body, sent_at
    FROM sends
    WHERE id = ?
  `).bind(id).first();

  if (!result) {
    return new Response(JSON.stringify({ success: false, error: "Email not found" }), { status: 404 });
  }

  return new Response(JSON.stringify({ success: true, email: result }), { headers: { "Content-Type": "application/json" } });
}
/*************************************************************************
 * Salvage Pulse chat widget loader
 *
 * Add this to the marketing site, just before </body>:
 *
 *   <script src="https://chat.salvagepulsepro.com/widget.js" defer></script>
 *
 * Optional attributes:
 *   data-open="true"       open on load
 *   data-position="left"   dock to the bottom-left
 *************************************************************************/
(function () {
  "use strict";

  if (window.__spChatWidgetLoaded) return;
  window.__spChatWidgetLoaded = true;

  const script = document.currentScript;
  const origin =
    (script && script.dataset.origin) ||
    (script && script.src ? new URL(script.src).origin : window.location.origin);
  const autoOpen = script?.dataset.open === "true";
  const position = script?.dataset.position === "left" ? "left" : "right";

  const style = document.createElement("style");
  style.textContent = `
    #sp-chat-widget {
      position: fixed;
      bottom: 20px;
      ${position}: 20px;
      z-index: 2147483000;
      font-family: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex;
      flex-direction: column;
      align-items: ${position === "left" ? "flex-start" : "flex-end"};
      gap: 10px;
    }
    #sp-chat-widget .sp-chat-frame {
      position: absolute;
      bottom: 82px;
      ${position}: 0;
      width: 360px;
      max-width: calc(100vw - 28px);
      height: min(540px, calc(100vh - 112px));
      border: 1px solid #1b2b44;
      border-radius: 16px;
      background: #071020;
      box-shadow: 0 28px 90px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(56, 189, 248, 0.06);
      overflow: hidden;
      opacity: 0;
      transform: translateY(12px) scale(0.985);
      transform-origin: bottom ${position};
      pointer-events: none;
      transition: opacity 180ms ease, transform 180ms ease;
      display: block;
    }
    #sp-chat-widget .sp-chat-frame.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    #sp-chat-widget .sp-chat-frame iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      background: #071020;
    }
    #sp-chat-widget .sp-chat-teaser {
      width: 320px;
      max-width: calc(100vw - 34px);
      border: 1px solid #1f3452;
      border-radius: 14px;
      background: linear-gradient(180deg, #0d1a2d, #08111f);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(56, 189, 248, 0.05);
      padding: 12px;
      position: relative;
      animation: sp-teaser-in 220ms ease both;
    }
    @keyframes sp-teaser-in {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    #sp-chat-widget .sp-chat-teaser-close {
      position: absolute;
      top: 7px;
      right: 7px;
      width: 22px;
      height: 22px;
      border: 0;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.04);
      color: #7f97b5;
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      display: grid;
      place-items: center;
    }
    #sp-chat-widget .sp-chat-teaser-close:hover {
      color: #e9f0fc;
      background: rgba(255, 255, 255, 0.08);
    }
    #sp-chat-widget .sp-chat-teaser-open {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      border: 0;
      background: transparent;
      padding: 0;
      text-align: left;
      cursor: pointer;
      color: #dbe7f8;
      font-family: inherit;
      width: 100%;
    }
    #sp-chat-widget .sp-chat-teaser-open img {
      width: 38px;
      height: 38px;
      border-radius: 9px;
      object-fit: cover;
      border: 1px solid #2a4a73;
      background: #000;
      flex-shrink: 0;
    }
    #sp-chat-widget .sp-chat-teaser-open span {
      display: grid;
      gap: 3px;
      padding-right: 14px;
    }
    #sp-chat-widget .sp-chat-teaser-open strong {
      font-family: "Manrope", ui-sans-serif, sans-serif;
      font-size: 13px;
      color: #fff;
      letter-spacing: -0.01em;
    }
    #sp-chat-widget .sp-chat-teaser-open em {
      font-style: normal;
      font-size: 11.5px;
      line-height: 1.45;
      color: #9db2cc;
    }
    #sp-chat-widget .sp-chat-teaser-open b {
      color: #7dd3fc;
      font-weight: 600;
    }
    #sp-chat-widget .sp-chat-button {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      border: 2px solid rgba(56, 189, 248, 0.65);
      background: #000;
      color: #38bdf8;
      display: grid;
      place-items: center;
      cursor: pointer;
      box-shadow: 0 14px 38px rgba(0, 0, 0, 0.45), 0 0 0 5px rgba(56, 189, 248, 0.07);
      transition: transform 160ms ease, box-shadow 160ms ease;
      padding: 0;
      overflow: hidden;
    }
    #sp-chat-widget .sp-chat-avatar {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
      display: block;
    }
    #sp-chat-widget .sp-chat-button:hover {
      transform: translateY(-2px) scale(1.03);
      box-shadow: 0 18px 46px rgba(0, 0, 0, 0.5), 0 0 0 7px rgba(56, 189, 248, 0.1);
    }
    #sp-chat-widget .sp-chat-button:focus-visible {
      outline: 2px solid #38bdf8;
      outline-offset: 3px;
    }
    #sp-chat-widget .sp-chat-ping {
      position: absolute;
      top: 1px;
      right: 1px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #34d399;
      border: 2px solid #071020;
    }
    #sp-chat-widget .sp-chat-button-wrap {
      position: relative;
      line-height: 0;
    }
    #sp-chat-widget .sp-chat-label {
      position: absolute;
      bottom: 12px;
      ${position === "left" ? "left" : "right"}: 70px;
      background: #0b1a33;
      border: 1px solid #1b2b44;
      color: #dbe7f8;
      border-radius: 9px;
      padding: 7px 11px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 160ms ease, transform 160ms ease;
      pointer-events: none;
    }
    #sp-chat-widget:hover .sp-chat-label {
      opacity: 1;
      transform: translateY(0);
    }
    @media (max-width: 560px) {
      #sp-chat-widget {
        bottom: 12px;
        ${position}: 12px;
      }
      #sp-chat-widget .sp-chat-frame {
        width: calc(100vw - 24px);
        height: calc(100dvh - 100px);
        max-height: 620px;
        border-radius: 15px;
        bottom: 74px;
      }
      #sp-chat-widget .sp-chat-button {
        width: 52px;
        height: 52px;
      }
      #sp-chat-widget .sp-chat-teaser {
        width: calc(100vw - 34px);
      }
      #sp-chat-widget .sp-chat-label {
        display: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      #sp-chat-widget .sp-chat-frame,
      #sp-chat-widget .sp-chat-button {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "sp-chat-widget";

  const frameWrap = document.createElement("div");
  frameWrap.className = "sp-chat-frame";
  frameWrap.setAttribute("aria-hidden", "true");

  const frame = document.createElement("iframe");
  frame.title = "Wheelie — Salvage Pulse Assistant";
  frame.src = `${origin}/widget?embed=1`;
  frame.setAttribute("allow", "clipboard-write");
  frameWrap.appendChild(frame);

  const teaserEnabled = script?.dataset.teaser !== "false";

  const teaser = document.createElement("div");
  teaser.className = "sp-chat-teaser";
  teaser.hidden = true;
  teaser.innerHTML = `
    <button class="sp-chat-teaser-close" type="button" aria-label="Dismiss Wheelie’s greeting">×</button>
    <button class="sp-chat-teaser-open" type="button" aria-label="Open Wheelie">
      <img src="${origin}/wheelie-avatar.jpg" alt="" />
      <span>
        <strong>Wheelie</strong>
        <em>Need a hand with plans, a demo, or <b>your account</b>?</em>
      </span>
    </button>`;

  const buttonWrap = document.createElement("div");
  buttonWrap.className = "sp-chat-button-wrap";

  const label = document.createElement("span");
  label.className = "sp-chat-label";
  label.textContent = "Questions? Ask Wheelie";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "sp-chat-button";
  button.setAttribute("aria-label", "Open Wheelie, the Salvage Pulse assistant");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = `<img class="sp-chat-avatar" src="${origin}/wheelie-avatar.jpg" alt="" />`;

  const ping = document.createElement("span");
  ping.className = "sp-chat-ping";
  button.appendChild(ping);

  buttonWrap.appendChild(label);
  buttonWrap.appendChild(button);

  root.appendChild(frameWrap);
  root.appendChild(teaser);
  root.appendChild(buttonWrap);

  let open = autoOpen;

  function teaserDismissed() {
    try {
      return sessionStorage.getItem("sp-wheelie-teaser-dismissed") === "1";
    } catch {
      return false;
    }
  }

  function hideTeaser(persist = false) {
    teaser.hidden = true;
    if (persist) {
      try {
        sessionStorage.setItem("sp-wheelie-teaser-dismissed", "1");
      } catch {
        /* ignore */
      }
    }
  }

  function showTeaser() {
    if (!teaserEnabled || open || teaserDismissed()) return;
    teaser.hidden = false;
  }

  function applyState() {
    frameWrap.classList.toggle("open", open);
    frameWrap.setAttribute("aria-hidden", String(!open));
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close Wheelie" : "Open Wheelie, the Salvage Pulse assistant");
    button.innerHTML = open
      ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`
      : `<img class="sp-chat-avatar" src="${origin}/wheelie-avatar.jpg" alt="" />`;
    if (!open) {
      const newPing = document.createElement("span");
      newPing.className = "sp-chat-ping";
      button.appendChild(newPing);
    } else {
      hideTeaser(true);
    }
  }

  function setOpen(next) {
    open = next;
    applyState();
    if (open) frame.focus();
  }

  button.addEventListener("click", () => setOpen(!open));
  teaser.querySelector(".sp-chat-teaser-close").addEventListener("click", (event) => {
    event.stopPropagation();
    hideTeaser(true);
  });
  teaser.querySelector(".sp-chat-teaser-open").addEventListener("click", () => {
    hideTeaser(true);
    setOpen(true);
  });

  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data && event.data.type === "sp-chat-close") setOpen(false);
  });

  function mount() {
    document.body.appendChild(root);
    applyState();
    if (!autoOpen) {
      setTimeout(showTeaser, 2400);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();

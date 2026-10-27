/*!
 * AS Design Studio — Project Builder embed loader
 *
 * Inline (renders where the target element is):
 *   <div id="asd-project-builder"></div>
 *   <script src="https://automation.asdesignlb.com/widget.js" data-target="#asd-project-builder" async></script>
 *
 * Popup (floating button that opens the builder in a modal):
 *   <script src="https://automation.asdesignlb.com/widget.js" data-mode="popup" data-label="Start a project" async></script>
 *
 * Open the popup from your own buttons:  <a href="#" data-asd-open>Get a proposal</a>   or   window.ASDBuilder.open()
 * Listen for submissions:                window.addEventListener("asd:lead-submitted", (e) => console.log(e.detail.reference))
 *
 * Options (data-* attributes on the script tag):
 *   data-mode="inline|popup"   data-target="#css-selector"   data-label="Button text"
 *   data-background="transparent"   data-position="right|left"   data-accent="#ff8a4c"
 *   data-launcher="false"  (popup mode without the floating button — use your own [data-asd-open] triggers)
 */
(function () {
  "use strict";
  if (window.ASDBuilder) return;

  var script =
    document.currentScript ||
    (function () {
      var scripts = document.querySelectorAll('script[src*="widget.js"]');
      return scripts[scripts.length - 1];
    })();
  if (!script) return;

  var appOrigin = new URL(script.src).origin;
  var mode = script.getAttribute("data-mode") || (script.getAttribute("data-target") ? "inline" : "popup");
  var accent = script.getAttribute("data-accent") || "#ff8a4c";
  var position = script.getAttribute("data-position") === "left" ? "left" : "right";
  var label = script.getAttribute("data-label") || "Start your project";
  var background = script.getAttribute("data-background") === "transparent" ? "transparent" : "";

  function builderUrl() {
    var url = new URL("/embed", appOrigin);
    var host = new URL(window.location.href);
    host.searchParams.forEach(function (value, key) {
      if (key.indexOf("utm_") === 0) url.searchParams.set(key, value);
    });
    url.searchParams.set("origin", window.location.origin);
    url.searchParams.set("page", window.location.href.slice(0, 500));
    if (document.referrer) url.searchParams.set("ref", document.referrer.slice(0, 500));
    if (background) url.searchParams.set("bg", background);
    return url.toString();
  }

  function createFrame(minHeight) {
    var iframe = document.createElement("iframe");
    iframe.src = builderUrl();
    iframe.title = "Project builder";
    iframe.loading = "lazy";
    iframe.allow = "clipboard-write; microphone";
    iframe.setAttribute("allowtransparency", "true");
    iframe.style.cssText =
      "display:block;width:100%;border:0;background:transparent;color-scheme:dark;min-height:" +
      minHeight +
      "px;height:" +
      minHeight +
      "px;transition:height .25s ease";
    return iframe;
  }

  var frames = [];
  window.addEventListener("message", function (event) {
    if (event.origin !== appOrigin || !event.data || event.data.source !== "asd-builder") return;
    var frame = frames.filter(function (f) {
      return f.contentWindow === event.source;
    })[0];
    var autoHeight = frame && frame.getAttribute("data-autoheight") === "true";
    if (event.data.type === "asd:resize" && autoHeight) {
      frame.style.height = Math.max(480, Number(event.data.height) || 0) + "px";
    }
    if (event.data.type === "asd:scroll-top" && autoHeight) {
      var top = frame.getBoundingClientRect().top + window.scrollY - 24;
      if (top < window.scrollY) window.scrollTo({ top: top, behavior: "smooth" });
    }
    if (event.data.type === "asd:submitted") {
      window.dispatchEvent(new CustomEvent("asd:lead-submitted", { detail: { reference: event.data.reference } }));
    }
  });

  function mountInline(target) {
    var frame = createFrame(820);
    frame.setAttribute("data-autoheight", "true");
    target.appendChild(frame);
    frames.push(frame);
  }

  var overlay = null;
  var panel = null;

  function open() {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Project builder");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,6,10,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .25s ease";
      panel = document.createElement("div");
      panel.style.cssText =
        "position:relative;width:min(1180px,100%);height:min(900px,100%);border-radius:24px;overflow:hidden;box-shadow:0 40px 120px -30px rgba(0,0,0,.8);background:#06060a;transform:translateY(12px);transition:transform .3s cubic-bezier(.16,1,.3,1)";
      var close = document.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", "Close");
      close.innerHTML = "&times;";
      close.style.cssText =
        "position:absolute;top:12px;right:12px;z-index:2;width:36px;height:36px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:rgba(15,15,22,.85);color:#f4f1ea;font:22px/1 system-ui;cursor:pointer";
      close.addEventListener("click", hide);
      var frame = createFrame(600);
      frame.style.height = "100%";
      frames.push(frame);
      panel.appendChild(close);
      panel.appendChild(frame);
      overlay.appendChild(panel);
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) hide();
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && overlay && overlay.style.display !== "none") hide();
      });
      document.body.appendChild(overlay);
    }
    overlay.style.display = "flex";
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(function () {
      overlay.style.opacity = "1";
      panel.style.transform = "translateY(0)";
    });
  }

  function hide() {
    if (!overlay) return;
    overlay.style.opacity = "0";
    panel.style.transform = "translateY(12px)";
    document.documentElement.style.overflow = "";
    setTimeout(function () {
      overlay.style.display = "none";
    }, 250);
  }

  function mountLauncher() {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText =
      "position:fixed;bottom:24px;" +
      position +
      ":24px;z-index:2147483645;padding:14px 22px;border:0;border-radius:999px;cursor:pointer;font:600 15px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:#06060a;background:" +
      accent +
      ";box-shadow:0 12px 40px -10px " +
      accent +
      ";transition:transform .2s ease";
    button.addEventListener("mouseenter", function () {
      button.style.transform = "translateY(-2px)";
    });
    button.addEventListener("mouseleave", function () {
      button.style.transform = "";
    });
    button.addEventListener("click", open);
    document.body.appendChild(button);
  }

  function init() {
    document.addEventListener("click", function (event) {
      var trigger = event.target && event.target.closest && event.target.closest("[data-asd-open]");
      if (trigger) {
        event.preventDefault();
        open();
      }
    });
    if (mode === "inline") {
      var target = document.querySelector(script.getAttribute("data-target") || "#asd-project-builder");
      if (target) mountInline(target);
      else console.warn("[ASD widget] target element not found");
    } else if (script.getAttribute("data-launcher") !== "false") {
      mountLauncher();
    }
  }

  window.ASDBuilder = { open: open, close: hide };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

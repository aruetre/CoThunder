"use strict";
console.log("[CoThunder] content script activo en", location.href);
messenger.runtime.sendMessage({ type: "contentAlive", url: location.href }).catch(() => {});

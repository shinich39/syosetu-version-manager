const { contextBridge, ipcRenderer } = require("electron");

const isError = function (e) {
  return e && e.stack && e.message;
};

const sendHandler = function (channel, message) {
  if (isError(message)) {
    ipcRenderer.send(channel, message, null);
  } else {
    ipcRenderer.send(channel, null, message);
  }
};

const onHandler = function (channel, listener) {
  ipcRenderer.on(channel, function (event, err, message) {
    return listener(err, message, event);
  });
};

const onceHandler = function (channel, listener) {
  ipcRenderer.once(channel, function (event, err, message) {
    return listener(err, message, event);
  });
};

onceHandler("enable-development-mode", function () {
  onceHandler("ping", (err, message, event) => {
    console.log(message);
    ipcRenderer.send("pong", null, "pong");
  });

  onceHandler("refresh", function (err, message, event) {
    location.reload();
  });
});

contextBridge.exposeInMainWorld("electron", {
  send: sendHandler,
  on: onHandler,
  once: onceHandler,
});

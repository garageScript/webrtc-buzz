const $debugger = document.querySelector("#debuggerContainer");
const $body = document.querySelector("#bodyContainer");
const $logList = document.querySelector("#logsContainer");
const $userList = document.querySelector("#userList");

const debug = {};
const logList = [];

const userColorMap = {};

function UserColor(userId) {
  const container = document.createElement("div");
  const color = chroma.random()._rgb;

  this.getColorStr = () => {
    return `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.4)`;
  };

  if (userId !== "all") {
    container.style.backgroundColor = this.getColorStr();
  }
  container.className = "userPill";
  container.innerText = userId;
  this.select = () => {
    Object.values(userColorMap).forEach((um) => {
      um.unselect();
    });
    container.classList.add("selected");
    logList.forEach((log) => {
      log.toggle(userId);
    });
  };
  this.unselect = () => {
    container.classList.remove("selected");
  };
  container.onclick = () => {
    this.select();
  };
  $userList.append(container);
}

const getUserColor = (userId) => {
  if (!userColorMap[userId]) {
    userColorMap[userId] = new UserColor(userId);
  }
  return userColorMap[userId].getColorStr();
};
userColorMap.all = new UserColor("all");
userColorMap.all.select();

let userCounter = 1;
let userNameMap = {};
const getSanitizedUserId = (userId) => {
  if (!userId) return null;
  if (!userNameMap[userId]) {
    userNameMap[userId] = userCounter;
    userCounter += 1;
  }
  return userNameMap[userId];
};

function Log(ts, log, userId) {
  let counter = 1;
  const container = document.createElement("div");
  container.style.borderBottom = "1px solid rgba(10, 10, 10, 0.5)";
  if (userId) {
    container.style.backgroundColor = getUserColor(userId);
  }
  container.innerHTML = `
  <p>
  ${log}
  </p>
  `;
  $logList.append(container);
  this.match = (newLog, newUserId) => {
    if (newLog !== log || newUserId !== userId) return;
    counter += 1;
    container.innerHTML = `
  <p>
  :::${counter}::: ${log} 
  </p>
  `;
    return true;
  };
  this.toggle = (filter) => {
    if (filter === "all" || filter === userId) {
      container.style.display = "block";
      return;
    }
    container.style.display = "none";
  };

  this.export = () => ({
    ts,
    log,
    userId,
  });
}

debug.log = (log, unsanitizedUserId) => {
  const userId = getSanitizedUserId(unsanitizedUserId);
  if (logList.length && logList[logList.length - 1].match(log, userId)) {
    return;
  }
  logList.push(new Log(Date.now(), log, userId));
};

debug.start = () => {
  $debugger.style.right = "0";
  $body.style.right = "300px";
};

window.debug = debug;

debug.close = () => {
  $debugger.style.right = "-300px";
  $body.style.right = "0px";
};

debug.sendLogData = (fileName) => {
  fetch("/report", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fileName,
      logs: logList.map((l) => l.export()),
      userId: socket.id,
    }),
  });
};

debug.sendLog = (problem) => {
  fetch("/report", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      problem,
      logs: logList.map((l) => l.export()),
      userId: socket.id,
    }),
  })
    .then((r) => r.json())
    .then((result) => {
      alert(
        `Reported thank you. Report logs collected: ${result.url}. You may close the window.`
      );

      socket.emit("broadcast", {
        eventName: "sendDebugger",
        data: {
          fileName: result.fileName,
        },
      });
    });
};

//setTimeout(debug.start, 500);

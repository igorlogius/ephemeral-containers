/* global browser */

// cookieStoreIds of all managed containers
let containerCleanupTimer = null;
let opennewtab = false;
let usecolors = [];
let deldelay = 3000;
let multiopen = 3;

// array of all allowed container colors
const allcolors = [
  "blue",
  "turquoise",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
];

async function getFromStorage(type, id, fallback) {
  let tmp = await browser.storage.local.get(id);
  return typeof tmp[id] === type ? tmp[id] : fallback;
}

browser.menus.create({
  title: "Open in Temp Container(s)",
  contexts: ["link", "page", "tab", "bookmark"],
  onclick: async (clickdata, tab) => {
    if (clickdata.linkUrl) {
      createTempContainerTab(clickdata.linkUrl);
    } else if (clickdata.bookmarkId) {
      const bms = await browser.bookmarks.get(clickdata.bookmarkId);
      if (bms.length > 0) {
        const bm = bms[0];
        if (bm.url) {
          createTempContainerTab(bm.url);
        } else {
          for (const c of await browser.bookmarks.getChildren(
            clickdata.bookmarkId
          )) {
            if (c.url) {
              createTempContainerTab(c.url);
            }
          }
        }
      }
    } else if (clickdata.frameUrl) {
      createTempContainerTab(clickdata.frameUrl);
    } else if (clickdata.srcUrl) {
      createTempContainerTab(clickdata.srcUrl);
    } else if (clickdata.pageUrl) {
      createTempContainerTab(clickdata.pageUrl);
    } else if (tab.url) {
      createTempContainerTab(tab.url);
    }
  },
});

// delayed container cleanup
async function onTabRemoved() {
  if (containerCleanupTimer !== null) {
    clearTimeout(containerCleanupTimer);
  }

  containerCleanupTimer = setTimeout(async () => {
    const containerWithTabs = new Set(
      (await browser.tabs.query({})).map((t) => t.cookieStoreId)
    );

    containers = await browser.contextualIdentities.query({});

    containers.forEach((c) => {
      if (
        !containerWithTabs.has(c.cookieStoreId) &&
        c.name.startsWith("Temp")
      ) {
        browser.contextualIdentities.remove(c.cookieStoreId);
      }
    });
    containerCleanupTimer = null;
  }, deldelay);
}

async function createTempContainerTab(url) {
  let container = await createContainer({});
  let tabs = await browser.tabs.query({ currentWindow: true, active: true });
  const index = tabs.length > 0 ? tabs[0].index + 1 : -1;

  obj = {
    active: true,
    index: index,
    cookieStoreId: container.cookieStoreId,
  };
  if (typeof url === "string" && url.startsWith("http")) {
    obj["url"] = url;
  }
  browser.tabs.create(obj);
}

async function openNewTabInExistingContainer(cookieStoreId) {
  let tabs = await browser.tabs.query({ currentWindow: true, active: true });
  const index = tabs.length > 0 ? tabs[0].index + 1 : -1;
  browser.tabs.create({
    active: true,
    index: index,
    cookieStoreId: cookieStoreId,
  });
}

function onBAClicked(tab) {
  if (opennewtab) {
    createTempContainerTab();
  } else {
    createTempContainerTab(tab.url);
  }
}

async function createContainer() {
  let color = usecolors[Math.floor(Math.random() * usecolors.length)];
  let container = await browser.contextualIdentities.create({
    name: "Temp",
    color: color,
    icon: "circle",
  });
  let cookieStoreId = container.cookieStoreId;
  let name = "Temp " + Date.now();
  await browser.contextualIdentities.update(cookieStoreId, { name: name });
  return container;
}

async function syncMemory() {
  opennewtab = await getFromStorage("boolean", "opennewtab", false);
  usecolors = await getFromStorage("object", "usecolors", allcolors);
  if (!Array.isArray(usecolors)) {
    usecolors = allcolors;
  }
  if (usecolors.length < 1) {
    usecolors = allcolors;
  }
  deldelay = await getFromStorage("number", "deldelay", 3000);
  multiopen = await getFromStorage("number", "multiopen", 3);
}

(async () => {
  await syncMemory();
  setTimeout(onTabRemoved, deldelay);
})();

// register listeners
browser.tabs.onRemoved.addListener(onTabRemoved);
browser.browserAction.onClicked.addListener(onBAClicked);
browser.storage.onChanged.addListener(syncMemory);

browser.commands.onCommand.addListener(async (command) => {
  if (command === "opennewtab") {
    createTempContainerTab("about:newtab");
  }

  if (command === "openinsame") {
    // get container of currently active tab
    // create new tab with container id
    let tabs = await browser.tabs.query({ currentWindow: true, active: true });
    if (tabs.length > 0) {
      const atab = tabs[0];
      openNewTabInExistingContainer(atab.cookieStoreId);
    }
  }

  if (command === "multiopen") {
    let tabs = await browser.tabs.query({ currentWindow: true, active: true });
    if (tabs.length > 0) {
      const atab = tabs[0];
      for (let i = 0; i < multiopen; i++) {
        createTempContainerTab(atab.url);
      }
    }
  }
});

async function handleUpdated(tabId, changeInfo, tabInfo) {
  if (changeInfo.url) {
    if (changeInfo.url.startsWith("http")) {
      try {
        const container = await browser.contextualIdentities.get(
          tabInfo.cookieStoreId
        );
        if (container.name.startsWith("Temp")) {
          const visits = await browser.history.getVisits({
            url: changeInfo.url,
          });

          if (visits.length < 5) {
            setTimeout(() => {
              browser.history.deleteUrl({
                url: changeInfo.url,
              });
            }, 2000);
          }
        }
      } catch (e) {
        // noop
      }
    }
  }
}

var testPermissions1 = {
  permissions: ["history"],
};

async function handlePermissionChange(permissions) {
  if (await browser.permissions.contains(testPermissions1)) {
    await browser.tabs.onUpdated.addListener(handleUpdated);
  } else {
    await browser.tabs.onUpdated.removeListener(handleUpdated);
  }
}
browser.permissions.onAdded.addListener(handlePermissionChange);
browser.permissions.onRemoved.addListener(handlePermissionChange);

handlePermissionChange();

// show the user the options page on first installation
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.runtime.openOptionsPage();
  }
});

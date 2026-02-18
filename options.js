// Load saved settings on options page load
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(
    ["accountId", "clientId", "backendUrl"],
    ({ accountId, clientId, backendUrl }) => {
      if (accountId) document.getElementById("accountId").value = accountId;
      if (clientId) document.getElementById("clientId").value = clientId;
      if (backendUrl) document.getElementById("backendUrl").value = backendUrl;
    }
  );

  document.getElementById("saveBtn").addEventListener("click", () => {
    const accountId = document.getElementById("accountId").value.trim();
    const clientId = document.getElementById("clientId").value.trim();
    const backendUrl = document.getElementById("backendUrl").value.trim();

    chrome.storage.sync.set({ accountId, clientId, backendUrl }, () => {
      const statusText = document.getElementById("statusText");
      statusText.textContent = "Saved!";
      setTimeout(() => {
        statusText.textContent = "";
      }, 2000);
    });
  });
});


var thirdParty_mode = false;


function insertUrl(request) {
  let node;

  function listIdentifyingCookies() {
    node = document.createElement("details");
    let summary = document.createElement("summary");
    summary.innerText = request.domain + " : " + request.url;
    node.appendChild(summary)
    for (let i in request.cookies) {
      if (request.cookies[i].identifying) {
        let cookie = document.createElement("div");
        cookie.innerText = request.cookies[i].key;
        node.appendChild(cookie);
      }
    }
  }

  function listOnlyUrl() {
    node = document.createElement("div");
    node.innerText = request.domain + " : " + request.url;
  }

  if (request.cookies.filter(cookie => cookie.identifying === true).length > 0) {
    listIdentifyingCookies();
  } else {
    listOnlyUrl();
  }

  node.className = request.category + " " + request.party + " url";
  if(request.party === "first") {
    hideElement(node);
  }
  document.getElementById("urls").appendChild(node);
}

//either hides all non relevant items or displays them
function toggleMode(){
  const divsToHide = document.getElementsByClassName("first");
  for(let i = 0; i < divsToHide.length; i++){
    hideElement(divsToHide[i]);
  }
}

function hideElement(element) {
  if (thirdParty_mode) {
    element.style.display = "none";
  } else {
    element.style.display = "block"
  }
}

// currently static
function setStats(tab){
  try{
    document.getElementById("requests").innerHTML = tab.requests.length.toString();
    document.getElementById("third").innerHTML = document.getElementsByClassName("third").length.toString();

    let send = 0;
    tab.requests.forEach((request) => {
      send += request.cookies.length;
    })
    document.getElementById("cookies-send").innerHTML = send.toString();
    let set = 0;
    tab.responses.forEach((response) => {
      set += response.cookies.length;
    })
    document.getElementById("cookies-set").innerHTML = set.toString();
  } catch (e) {
    console.warn(e);
  }
}

function constructPage() {
// when popup is opened, the data is fetched form the background script and inserted into the html
  document.getElementById("current-page").innerHTML = "Page: " + backgroundPage.tabs[backgroundPage.currentTab].domain;
  document.getElementById("urls").innerHTML = "";
  backgroundPage.tabs[backgroundPage.currentTab].requests.forEach((request, i) => { // error if Tab not initilized
    insertUrl(request);
  });
  setStats(backgroundPage.tabs[backgroundPage.currentTab]);
}

var getting = browser.runtime.getBackgroundPage();
var backgroundPage;
getting.then(async (page) => {
  backgroundPage = page;
  backgroundPage.setCurrentTab().then(constructPage);
});


document.getElementById("thirdParty_button").addEventListener("click", function(){
  document.getElementById("popup-title").innerHTML = "3rd Party Requests";
  thirdParty_mode = true;
  toggleMode()
});

document.getElementById("all").addEventListener("click", function(){
  document.getElementById("popup-title").innerHTML = "All Requests";
  thirdParty_mode = false;
  toggleMode();
});

function evaluateMessage(message) {
  if (message.request) {
    insertUrl(message.request);
    setStats(backgroundPage.tabs[message.request.tabId]); // this is potentially very slow
  } else if (message.reload) {
    constructPage();
  }
}

browser.runtime.onMessage.addListener(evaluateMessage);

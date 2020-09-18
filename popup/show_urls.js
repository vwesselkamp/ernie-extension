var thirdParty_mode = false;


function insertUrl(url, domain, party) {
  let node = document.createElement("LI");
  node.appendChild(document.createTextNode(domain + " : " + url));
  node.className = party;
  if(party == "first") {
    hideElement(node);
  }
  document.getElementById("urls").appendChild(node);
  window.scrollTo(0,document.body.scrollHeight);
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

// when popup is opened, the data is fetched form the background script and inserted into the html
var getting = browser.runtime.getBackgroundPage();
getting.then((page) => {
  document.getElementById("current-page").innerHTML = "Page: " + page.tabs[page.currentTab].domain;
  page.tabs[page.currentTab].requests.forEach((request, i) => { // error if Tab not initilized
    insertUrl(request.url, request.domain, request.party);
  });
});


document.getElementById("thirdParty_button").addEventListener("click", function(){
  document.getElementById("popup-title").innerHTML = "Third Party Requests";
  thirdParty_mode = true;
  toggleMode()
});

document.getElementById("all").addEventListener("click", function(){
  document.getElementById("popup-title").innerHTML = "All Requests";
  thirdParty_mode = false;
  toggleMode();
});

browser.runtime.onMessage.addListener((message) => {
  insertUrl(message.request.url, message.request.domain, message.request.party);
});

var thirdParty_mode = false;


function insertUrl(url, domain, party) {
  let node = document.createElement("LI");
  node.appendChild(document.createTextNode(domain + " : " + url));
  node.className = party;
  // if(party == "first") {
  //   hideElement(node);
  // }
  document.getElementById("urls").appendChild(node);
  window.scrollTo(0,document.body.scrollHeight);
}

function hideElement(element) {
  if (thirdParty_mode) {
    element.style.display = "none";
  } else {
    element.style.display = "block"
  }
}

//either hides all non relevant items or displays them
function toggleMode(){
  const divsToHide = document.getElementsByClassName("first");
  for(let i = 0; i < divsToHide.length; i++){
    hideElement(divsToHide[i]);
  }
}


var getting = browser.runtime.getBackgroundPage();
getting.then((page) => {
  document.getElementById("current-page").innerHTML = "Page: " + page.rootUrl;
  page.getActiveTab().then((tabs) => {
    page.requestsByTab[tabs[0].id].forEach((request, i) => { // error if no reqeusts in that tab yet
      insertUrl(request.url, request.domain, request.party);
    });
  })
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

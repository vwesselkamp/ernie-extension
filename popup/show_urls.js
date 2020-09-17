var thirdParty_mode = false;
var tabId;
var rootUrl;
var urlsByTab;

function insertUrl(url, party) {
 document.getElementById("urls").insertAdjacentHTML('beforeend', `
     <li class="` + party + ` url">
       <div>
        `+ party + ` : `+ url + `
        </div>
     </li>`
   );
   window.scrollTo(0,document.body.scrollHeight);
   toggleMode();
}

//either hides all non relevant items or displays them
function toggleMode(){
  var divsToHide = document.getElementsByClassName("other");
  for(var i = 0; i < divsToHide.length; i++){
    if(thirdParty_mode){ //pull it up on the highest level?
      divsToHide[i].style.display = "none";
    } else {
      divsToHide[i].style.display = "block"
    }
  }
}

function handleWebRequest(message){
  if(message.request.tabId == tabId){
    insertUrl(message.request.url, "new");
  }
}

var gettingActiveTab = browser.tabs.query({active: true, currentWindow: true});
gettingActiveTab.then((tabs) => {
	tabId = tabs[0].id;
	var getting = browser.runtime.getBackgroundPage();
	getting.then((page) => {
		rootUrl = page.rootUrl;
		urlsByTab = page.urlsByTab
		document.getElementById("current-page").innerHTML = "Page: " + rootUrl;
		Object.keys(urlsByTab[tabId]).forEach(function(key,index) { //  can't convert undefined to object
	    insertUrl(key, urlsByTab[tabId][key]);
	  });
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

browser.runtime.onMessage.addListener(handleWebRequest);

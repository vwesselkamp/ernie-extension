var urlsByTab = {};

let facebook = [
			"facebook.com",
			"facebook.net",
			"fbcdn.com",
			"fbcdn.net"
		];

function checkIfOwnedByFB(url){
  for(let i= 0; i< facebook.length; i++){
    if(url.includes(facebook[i])){
      return "facebook";
    }
  }
  return "other";
}

function logURL(requestDetails) {
	if(urlsByTab[requestDetails.tabId] == undefined || requestDetails.originUrl == undefined){
		urlsByTab[requestDetails.tabId] = {};
  } else {
    urlsByTab[requestDetails.tabId][requestDetails.url] = checkIfOwnedByFB(requestDetails.url);
  }
}

browser.webRequest.onBeforeRequest.addListener(
  logURL,
  {urls: ["<all_urls>"]}
);

function getSecLevelDomain(tabUrl){
    var url = new URL(tabUrl);
    url = psl.get(url.hostname); // look at a public suffix list and finds domains such as amazon.co.ukA
    return url;
}

/*
  Superclass of all HTTP communication
 */
class HttpInfo{

    constructor(webRequest) {
        this.url = webRequest.url;
        this.tabId = webRequest.tabId;
        this.domain = getSecLevelDomain(webRequest.url);
        this.party = this.checkIfThirdParty(); // move this function into the object?
        this.cookies = [];
    }

    checkIfThirdParty(){
        if(this.domain !== tabs[this.tabId].domain){
            return "third";
        }
        return "first";

    }

    extractFromHeader(header) {
        header.forEach((attribute) => {
            this.findCookie(attribute);
            this.findContentType(attribute);
        })
    }

    findContentType(attribute){
        if (attribute.name.toLowerCase() === "content-type"){
            this.contentType = attribute.value;
        }
    }
}

/*
  Http request as reduced to the info we need.
 */
class RequestInfo extends HttpInfo{
    constructor(webRequest) {
        super(webRequest);
        this.header = webRequest.requestHeaders;

        this.extractFromHeader(this.header);
    }

    archive(tabId){
        tabs[tabId].requests.push(this);
        if (tabId === currentTab) {
            this.notifyPopupOfNewRequests(this); // only request are shown in the extension popup for now
        }
    }

    notifyPopupOfNewRequests(request) {
        var sending = browser.runtime.sendMessage({
            request: request
        });

        // catching the error when the popup is not open to receive messages and just dropping it
        function handleError(error) {
            if(error.toString().includes("Could not establish connection. Receiving end does not exist.")){
                return;
            }
            console.error(`Error: ${error}`);
        }

        function handleResponse() {}

        sending.then(handleResponse, handleError);
    }

    //for requests, all the cookies are send in one header attribute, if this is found, the cookies are extracted and returned
    findCookie(attribute){
        if (attribute.name.toLowerCase() === "cookie") {
            // cookies are seperated by ; and the values defined after the first =
            let result = attribute.value
                .split(';')
                .map(v => v.split(/=(.+)/)); // TODO: returns emptz string as third parameter for some reason
            result.forEach((cookie) => {
                this.cookies.push(new Cookie(this.url, cookie[0], cookie[1]));
            });
        }
    }

}

class ResponseInfo extends HttpInfo{
    constructor(webRequest) {
        super(webRequest);
        this.header = webRequest.responseHeaders;
        this.extractFromHeader(this.header);
    }

    archive(tabId){
        tabs[tabId].responses.push(this);
    }

    // for responses there can be several header attributes set cookies
    findCookie(attribute){
        if (attribute.name.toLowerCase() === "set-cookie") {
            let result = attribute.value
                .split(';', 1)
                .map(v => v.split(/=(.+)/));
            this.cookies.push(new Cookie(this.url, result[0][0], result[0][1]));
        }
    }
}


class Cookie{
    constructor (url, key, value) {
        this.url = url;
        this.key = key;
        this.value = value;
        this.checkIfIdCookie();
    }

    checkIfIdCookie(){
        var cookieIndex = db.transaction(["cookies"]).objectStore("cookies").index("url");

        // this is not an elegant solution, however i simply dont understand how onsuccess is assigned
        let cookie = this;
        var indexRange = IDBKeyRange.only(getSecLevelDomain(this.url));
        cookieIndex.openCursor(indexRange).onsuccess = function(event) {
            var cursor = event.target.result;
            if (cursor) {
                if (cursor.value.key === cookie.key) {
                    cookie.identifying = false;
                    console.info("Found safe cookie for " + cookie.url + ": " + cookie.key);
                }
                cursor.continue();
            } else {
                cookie.identifying = true;
            }
        };
    }
}
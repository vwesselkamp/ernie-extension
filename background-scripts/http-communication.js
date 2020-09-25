function getSecondLevelDomainFromDomain(url) {
    return psl.get(url.hostname); // look at a public suffix list and finds domains such as amazon.co.ukA
}

function getSecondLevelDomainFromUrl(tabUrl){
    var url = new URL(tabUrl);
    return getSecondLevelDomainFromDomain(url);
}

/*
  Superclass of all HTTP communication
 */
class HttpInfo{

    constructor(webRequest) {
        this.url = webRequest.url;
        this.tabId = webRequest.tabId;
        this.domain = getSecondLevelDomainFromUrl(webRequest.url);
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
        this.self = this;
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

        sending
            .then()
            .catch(function (error) {
                if(error.toString().includes("Could not establish connection. Receiving end does not exist.")){
                    return;
                }
                console.error(`Error: ${error}`);
            });
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

    //TODO: fix the this issue
    assignCategory() {
        const localFilter = this.filterIdCookies.bind(this);
        if(this.party === "third" && localFilter().length > 0){
            this.category = Categories.BASICTRACKING;
        }
    }

    filterIdCookies() {
        return this.cookies.filter(function (cookie) {
            return cookie.identifying === true;
        });
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
        this.identifying = true;
        this.checkIfIdCookie();
    }

    checkIfIdCookie(){
        var cookieIndex = db.transaction(["cookies"]).objectStore("cookies").index("url");

        // this is not an elegant solution, however i simply dont understand how onsuccess is assigned
        let cookie = this;
        var indexRange = IDBKeyRange.only(getSecondLevelDomainFromUrl(this.url));
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
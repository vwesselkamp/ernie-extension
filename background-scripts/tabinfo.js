let mongoDBUser;
let mongoDBPassword;
let originDBLocation;
let shadowDBLocation = 'http://localhost:8080/shadow-tabs';
let mongoDBAccess = false;

/**
 * Sets the vars we need to access the DB by retrieving them from the local storage
 */
function setDatabaseAccess() {
    var location = browser.storage.local.get('location');
    location.then((res) => {
        originDBLocation = res.location || 'http://localhost:8080/extension';
    });

    var user = browser.storage.local.get('user');
    user.then((res) => {
        mongoDBUser = res.user || 'admin';
        console.log(mongoDBUser)
    });

    var password = browser.storage.local.get('password');
    password.then((res) => {
        mongoDBPassword = res.password || 'secret';
    });
}
browser.storage.onChanged.addListener(setDatabaseAccess);

setDatabaseAccess();

fetch("http://localhost:8080/ping")
    .then(response => response.text())
    .then(text => {
        if(text.includes("Greetings from RESTHeart!")){
            mongoDBAccess = true;
            console.log("MongoDB accessible")
        } else {
            console.warn("MongoDB inaccessible")
        }
    });

class GenericTab {
    /**
     * @param url{string} is the full URL of the main page
     * @param tabId{number}
     */
    constructor(url, tabId) {
        this.url = url;
        this.tabId = tabId;
        this.domain = getSecondLevelDomainFromUrl(url)
        this.requests = [];
        this.responses = [];
        this.domains = [];
        this.redirects = [];

    }

    /**
     * @param id of a response
     * @param url of the same response
     * @returns {WebRequest} the requests that belongs to the response
     */
    getCorrespondingRequest(url, id){
        if(id){
            return this.requests.find(request => request.id === id && request.url === url);
        } else {
            return this.requests.find(request => request.url === url);
        }
    }

    /**
     * @param name of a domain
     * @returns Domain if exists or creates new Domain and returns that
     */
    upsertDomain(name){
        let domain = this.domains.find(domain => domain.name === name);
        if(domain){
            return domain;
        }
        domain = new Domain(name);
        this.domains.push(domain);
        return domain;
    }

    get mainDomain(){
        return this.domains.find(domain => domain.name === this.domain);
    }

    /**
     * Stores the request/response it receives in the corresponding array, then sorts it into a domain
     */
    storeWebRequest(request){
        // the more specific class needs to be named first
        if (request instanceof Response) {
            this.responses.push(request);
        } else if(request instanceof WebRequest){
            this.requests.push(request);
        }
        let domain = this.upsertDomain(request.domain);
        domain.archive(request);
    }

    extendWebRequestCookies(domainName, cookies){
        let domain = this.upsertDomain(domainName);
        domain.addCookies(cookies);
    }

    markDomainAsTracker(domainName){
        let domain = this.upsertDomain(domainName)
        domain.setTracker(true);
    }

    isTracker(domainName) {
        let domain = this.domains.find(domain => domain.name === domainName);
        // This happens after a redirect, or if the isTracker() is called by a request that is the first from its domain.
        if(!domain){
            console.warn("Domain not yet initialized: " + domainName)
            return;
        }
        return domain.tracker;
    }

    addRedirect(redirect){
        this.redirects.push(redirect);
    }

    getRedirectsIfExist(requestId){
        let redirects = this.redirects.filter(redirect => redirect.id === requestId);
        if(redirects.length > 0){
            return redirects;
        }
    }

    createWebRequest(requestDetails){
        let webRequest = new WebRequest(requestDetails);
        this.storeWebRequest(webRequest);
    }

    createResponse(responseDetails){
        let response = new Response(responseDetails);
        this.storeWebRequest(response);
    }

    /**
     * For a response integrate the cookies in the corresponding request if possible
     * @param responseDetails
     * @returns {boolean}
     */
    integrateResponse(responseDetails){
        let request = this.getCorrespondingRequest(responseDetails.url, responseDetails.id);
        if(!request){
            console.warn("No corresponding request found for this response");
            return false;
        }
        request.integrateResponse(responseDetails);
        return true;
    }
}

/**
 * Tab replicating behaviour of a regular tab in the background
 */
class ShadowTab extends GenericTab{
    /**
     * @param url{string}
     * @param tabId{number}
     * @param originTabId{number}
     * @param originDbId{number} the timestamp at which the origin tab was created, used as identifier in the database
     */
    constructor(url, tabId, originTabId, originDbId) {
        super(url, tabId);
        this.originTab = originTabId;
        this._id = originDbId
    }
}

/**
 * Class to keep track of everything happening in a tab, until e.g. a new link is clicked or the site is refreshed
 * TODO: Refactor:
 * There is a duplication in the domain array and the response/request array.
 * From the request/response arrays I need the order of insertion for displaying, but the same requests are also saved
 * in the domains array under their respective domain.
 */
class OriginTab extends GenericTab{
    constructor(url, tabId) {
        super(url, tabId);
        this.evaluated = false;
        this._id = Date.now(); // this is used as an identifier for the database
        this.createContainer();
    }

    isEvaluated(){
        return this.evaluated;
    }

    /**
     * Creates a container for our shadow tab using the contextual identity API.
     * The container has its own cookieStore and a separate access to localStorage etc.
     * It also has a separated cache.
     */
    createContainer(){
        /**
         * Inside our container, a new hidden tab is created, that mirrors the request of the original tab
         * @param identity
         */
        function createShadowTab(identity) {
            browser.tabs.create({
                active: false, // this opens the tab in the background
                cookieStoreId: identity.cookieStoreId // this assigns the tab to our created contextual identity
            }).then(shadowTab => {
                this.shadowTabId = shadowTab.id;
                return browser.tabs.hide(shadowTab.id); // this hides the tab
            }).then(() => {
                console.info("Creating shadow Tab for " + this.url)
                browserTabs.addShadowTab(this.url, this.shadowTabId, this.tabId, this._id);
                //update sets the url of the shadowTab to that of the original request
                return browser.tabs.update(this.shadowTabId, {
                    url: this.url
                })
            }).catch(e => {
                console.log(e)
                this.removeContainerIfExists(); // this covered by .call() below
            });
        }

        browser.contextualIdentities.create({
            name: "shadow-" + this.domain, // name doesn't have to be unique, as a unique id is assigned by the browser
            color: "purple", //these two attributes are meaningless to us
            icon: "briefcase"
          }).then(identity => {
              this.container = identity;
              console.info("Created container for " + this.domain)
              createShadowTab.call(this, identity);
          });
    }

    /**
     * remove contextual identity as well as corresponding shadow tab
     */
    removeContainerIfExists(){
        if(this.shadowTabId){
          browser.tabs.remove(this.shadowTabId).catch(e=>{
              console.log(e)
              console.log(this.domain)
          });
        }
        if(this.container){
            browser.contextualIdentities.remove(this.container.cookieStoreId)
                .then(()=>console.log("removed for " + this.domain))
                .catch((e) => console.log(e));
        }
    }

    /**
     * Offline evaluation after the web page has finished loading
     * First all the cookies of the original and shadow request are compared and the identifying set as such
     * Then all categories are applied to all request/responses
     * This separates the phases cleanly, meaning that knowledge gained with a later requests can be applied
     * to change the category of an earlier request
     */
    evaluateRequests() {
        /**
         * Cookies are compared domain wide, meaning that if the domain of a request has a cookie in the same domain of the
         * shadow request, these are set. This also means, that the early requests are also classified correctly
         */
        function setIdentifyingCookies() {
            console.log("Comparing now " + this.url)

            for (let domain of this.domains) {
                let shadowDomain = browserTabs.getTab(this.shadowTabId).domains.find(sd => sd.name === domain.name)
                if (shadowDomain) {
                    for (let cookie of domain.cookies) {
                        cookie.compareCookiesFromShadowRequest(shadowDomain.cookies);
                    }
                } else {
                    console.warn("No shadow domain found for " + domain.name)
                }
            }
        }

        function basicTracking() {
            for (let request of this.requests) {
                if (request.isBasicTracking()) {
                    request.category = Categories.BASICTRACKING;
                    browserTabs.getTab(request.browserTabId).markDomainAsTracker(request.domain);
                }
            }
            for (let response of this.responses) {
                if (response.isBasicTracking()) {
                    response.category = Categories.BASICTRACKING;
                    browserTabs.getTab(response.browserTabId).markDomainAsTracker(response.domain);
                }
            }
        }

        function setTrackingByTracker() {
            for (let request of this.requests) {
                request.setTrackingByTracker();
            }
            for (let response of this.responses) {
                response.setTrackingByTracker();
            }
        }

        function setCookieSyncing() {
            for (let request of this.requests) {
                request.setCookieSyncing();
            }
            for (let response of this.responses) {
                response.setCookieSyncing();
            }
        }

        /**
         * If there are any cookies found in the cookie store at the end of a website loading, also store them in cookies
         * Since the same thing is not done for the background request, this is really not very useful at the moment.
         * TODO: find out what to do with this
         */
        function logCookiesFromJavascript() {
            function removeLeadingDots(domainName) {
                while (domainName.charAt(0) === ".") domainName = domainName.substr(1);
                return domainName;
            }

            for(let domain of this.domains){
                browser.cookies.getAll({
                    domain: domain.name
                }).then(storageCookies => {
                    for(let storageCookie of storageCookies){
                        let twin = domain.retrieveCookieIfExists(storageCookie.name, storageCookie.value)
                        if(!twin){
                            console.log("No corresponding cookie for \n " + JSON.stringify(storageCookie))
                            let strippedDomainName = removeLeadingDots(storageCookie.domain);
                            this.upsertDomain(getSecondLevelDomainFromDomain(strippedDomainName))
                                .addCookies([new Cookie(storageCookie.name, storageCookie.value, SET)])
                        }
                    }
                })
            }
        }


        logCookiesFromJavascript.call(this)
        setIdentifyingCookies.call(this);

        basicTracking.call(this);
        setTrackingByTracker.call(this);
        setCookieSyncing.call(this);

        this.evaluated = true;
        this.notifyPopupOfAnalysis()
        this.sendTabToDB();

    }

    /**
     * We send a POST requests with the whole object as JSON in the body.
     * For fetch, the authorization need to be set in the header.
     * The content type defaults to application/text and must be manually set to json, or the restheart API doesn't accept it
     */
    sendTabToDB() {
        if(!mongoDBAccess) return;
        console.log("Sending TAb with ID " + this._id)
        let headers = new Headers();
        headers.set('Authorization', 'Basic ' + btoa(mongoDBUser + ":" + mongoDBPassword));
        headers.set('Content-Type', 'application/json');

        fetch(originDBLocation, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(this)
        })

        fetch(shadowDBLocation, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(browserTabs.getTab(this.shadowTabId))
        })
    }

    notifyPopupOfAnalysis() {
        const sending = this.constructMessageToPopup();

        sending
            .then()
            .catch(Tabs.onMessageRejected);
    }

    /**
     * Sends the request and
     * @returns {Promise<any>} that can be used to extract the answer. As the popup doesn't answer we don't care
     * about resolving
     */
    constructMessageToPopup() {
        return browser.runtime.sendMessage({
            analysis: true
        });
    }
}

/**
 * Class that keeps track of all requests of a certain domain, and provides fast information about the domains tracking
 * properties.
 */
class Domain {
    constructor(domain) {
        this.name = domain;
        this.tracker = false;
        this.cookies = new Set();
        this.requests = [];
        this.responses = [];
    }

    /**
     * saves request/response in the corresponding array
     */
    archive(request){
        this.addCookies(request.cookies);
        if (request instanceof Response){
            this.responses.push(request);
        } else if(request instanceof WebRequest){
            this.requests.push(request);
        }
    }

    /**
     * @param cookieArray{[Cookie]} is an array of Cookie objects
     */
    addCookies(cookieArray) {
        for(let cookie of cookieArray){
            this.cookies.add(cookie)
        }
    }

    setTracker(value){
        this.tracker = value;
    }

    retrieveCookieIfExists(key, value){
        for(let cookie of this.cookies.values()){
            if(cookie.key === key && cookie.value === value){
                return cookie;
            }
        }
    }
}

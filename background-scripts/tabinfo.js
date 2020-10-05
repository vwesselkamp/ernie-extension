class GenericTab {
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
     * @returns the requests that belongs to the response
     */
    getCorrespondingRequest(id, url){
        return this.requests.find(request => request.id === id && request.url === url);
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
}

class ShadowTab extends GenericTab{
    constructor(url, tabId, origin) {
        super(url, tabId);
        this.originTab = origin;
    }
}

/**
 * Class to keep track of everything happening in a tab, until e.g. a new link is clicked or the site is refreshed
 * TODO: Refactor:
 * There is a duplication in the domain array and the response/request array.
 * From the request/response arrays I need the order of insertion for displaying, but the same requests are also saved
 * in the domains array under their respective domain.
 */
class TabInfo extends GenericTab{
    constructor(url, tabId) {
        super(url, tabId);
        console.log("Created Tab for " + this.domain)
        this.createContainer();

    }

    createContainer(){

      browser.contextualIdentities.create({
        name: "extension-" + this.domain,
        color: "purple",
        icon: "briefcase"
      }).then(identity => {
          this.container = identity;
          console.log("created container for " + this.domain)
          console.log(identity);
        try{
            browser.tabs.create({
                active: false,
                cookieStoreId: identity.cookieStoreId
            }).then(mirrorTab => {
                browser.tabs.hide(mirrorTab.id);
                // new ShadowTab is only created when a tab is openened, not if on a tab there is navigation
                console.log("Creating shadow Tab for " + this.url)
                tabs[mirrorTab.id] = new ShadowTab(this.url, mirrorTab.id, this.tabId);
                this.mirrorTabId = mirrorTab.id;

                browser.tabs.update(mirrorTab.id, {
                    url: this.url
                }).then(()=>{
                    // we need to check what it is with caching
                    // console.log("Reloading " + mirrorTab.id, tabs[mirrorTab.id].requests.length)
                    //
                    // browser.tabs.reload(mirrorTab.id, {
                    //     bypassCache: true
                    // }).then(()=> {
                    //     console.log("after")
                    //     console.log(tabs[mirrorTab.id])
                    // });
                });


            }).catch(e => console.log(e));
        } catch (e) {
        console.log(e);
        }
      });
    }

    removeContainerIfExists(){
      if(this.container){
          browser.tabs.remove(this.mirrorTabId);
          browser.contextualIdentities.remove(this.container.cookieStoreId).then(()=>console.log("removed for " + this.domain));
      }
    }

    evaluateRequests() {
        console.log("Comparing now " + this.url)
        for(let domain of this.domains){
            console.log("Domain " + domain.name)
            let shadowDomain = tabs[this.mirrorTabId].domains.find(sd => sd.name === domain.name)
            if(shadowDomain){
                for(let cookie of shadowDomain.cookies){
                    let commonCookies = domain.cookies.filter(coo => cookie.key === coo.key)
                    if(commonCookies){
                        for (let commonCookie of commonCookies){
                            if(commonCookie.value !== cookie.value){
                                // console.log("Found one!")
                                commonCookie.identifying = true;
                                // console.log(cookie)
                                // console.log(commonCookie)
                            }
                        }
                    }

                }
            }

        }
        for(let request of this.requests) {
            // third party requests with identifying cookies
            if (request.isBasicTracking()) {
                request.category = Categories.BASICTRACKING;
                tabs[request.browserTabId].markDomainAsTracker(request.domain);
            }
        }
        for(let request of this.requests) {

            // the referers domain has tracked on this website before
            // and the request itself is tracking
            if (request.isTrackingInitiatedByTracker()) {
                request.category = Categories.TRACKINGBYTRACKER
            }
        }
        for(let request of this.requests){

            if(request.isCookieSyncing()){
                request.category = Categories.SYNCING
            }
        }

        console.log("fini!")
        console.log(this.domains)
        console.log(tabs[this.mirrorTabId].domains)
        for(let response of this.responses){
            response.assignCategory();
        }
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
        this.cookies = [];
        this.requests = [];
        this.responses = [];
    }

    /**
     * saves request/response in the corresponding array
     */
    archive(request){
        this.cookies.push(...request.cookies)
        if (request instanceof Response){
            this.responses.push(request);
        } else if(request instanceof WebRequest){
            this.requests.push(request);
        }
    }

    setTracker(value){
        this.tracker = value;
    }
}

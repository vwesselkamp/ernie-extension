/**
 * This class encapsulate all the opened tabs and provides the methods to access them
 */
class Tabs{

    constructor() {
        this.tabs = [];
        this.currentTabId = this.setCurrentTab()
    }

    initializeShadowWindow(){
        function writeCookiesToStore(queryResult){
            const cursor = queryResult.target.result;
            if (cursor) {
                let cookie = cursor.value
                cookie['storeId'] = browserTabs.shadowCookieStoreId;
                if(cookie['hostOnly'] !== undefined){
                    delete cookie['hostOnly'];
                    delete cookie['session'];
                }
                cookie['url'] = "http" + (cookie.secure ? "s" : "") + "://"
                    + (cookie.domain.startsWith(".") ? cookie.domain.substr(1) : cookie.domain) + cookie.path

                browser.cookies.set(cursor.value)
                cursor.continue();
            }
        }

        function loadCookiesIntoShadowWindow() {
            // index over the domains of the safe cookies
            const cookieIndex = db.transaction(["cookies"]).objectStore("cookies");
            // filters all safe cookies for the request url
            try {
                let idbRequest = cookieIndex.openCursor();
                idbRequest.onsuccess = writeCookiesToStore;
                idbRequest.onerror = event => reject(event)
            } catch (e) {
                console.log(this.name)
                console.log(e)
            }
        }

        browser.windows.getAll({populate: true, windowTypes: ['normal']}).then(windows => {
            for (let window of windows){
                if (window.incognito){
                    return window
                }
            }
            return browser.windows.create({focused: false, incognito: true})
        }).then((window) => {
            this.shadowWindowID = window.id;
            let shadowTabId = window.tabs[0].id
            /* API doesn't allow access to cookieStore of Window directly, thus we have to check each sotre against the
            window ID of the shadowWindow
             */
            browser.cookies.getAllCookieStores().then((stores) => {
                for (let store of stores){
                    if(store.tabIds.includes(shadowTabId)){
                         browserTabs.shadowCookieStoreId = store.id;
                    }
                }

                loadCookiesIntoShadowWindow()
            })
        })
    }

    static getActiveTab() {
        return browser.tabs.query({active: true, currentWindow: true});
    }

    async setCurrentTab() {
        let tab = (await Tabs.getActiveTab())
        this.currentTabId = tab[0].id;
    }

    getTab(tabID){
        return this.tabs[tabID];
    }

    get currentTab(){
        return this.tabs[this.currentTabId];
    }

    tabExists = (tabID) => {
        return typeof this.tabs[tabID] !== 'undefined';
    }

    /**
     * @param url{string}
     * @param tabId
     * @returns {OriginTab} that was created
     */
    addTab(url, tabId){
        this.tabs[tabId] = new OriginTab(url, tabId, this.shadowWindowID);
        return this.tabs[tabId];
    }

    /**
     *
     * @param url{string} with all the parameters
     * @param tabId
     * @param origin{number} id of the original tab
     * @param originDbId{number}
     * @returns {*}
     */
    addShadowTab(url, tabId, origin, originDbId){
        this.tabs[tabId] = new ShadowTab(url, tabId, origin, originDbId);
        return this.tabs[tabId];
    }

    /**
     * init new Tab after clicking link, reloading or after startup
     * There is the tabId -1, which isn't associated with any tab
     */
    initializeCleanTab(browserTabId) {
        if( browserTabId === -1 ) {
            return;
        }
        // gets the information about our tab and initializes our own OriginTab object with it
        browser.tabs.get(browserTabId)
            .then((tab) => {

                if(tab.windowId === browserTabs.shadowWindowID) {
                    return;
                }
                if(!tab.url && ! tab.pendingUrl) return

                if(this.tabs[browserTabId]){
                    this.tabs[browserTabId].removeShadowIfExists();
                }
                if (tab.pendingUrl){
                    this.addTab(tab.pendingUrl, browserTabId);
                } else {
                    this.addTab(tab.url, browserTabId);
                }
            }).catch(error => console.error(error))
    }


    /**
     * Whenever we leave the current page, we throw out all old data and start with a new OriginTab object
     * @param details
     */
    clearTabsData(details){
        /**
         * Notifies Popup so that it can throw out all old requests as well, and start displaying the new ones
         */
        function notifyPopupOfReload() {
            browser.runtime.sendMessage({
                reload: true
            })
                .then()
                .catch(Tabs.onMessageRejected);
        }

        const getting = browser.tabs.get(details.tabId);

        getting.then((tab) =>{
            if(tab.windowId === browserTabs.shadowWindowID) return;

            // if the Navigation happens in an iFrame on the page we don't care
            if(details.frameId !== 0) {
                console.info("Navigational event on " + details.url + " with frame id " + details.frameId)
                return;
            }

            this.setCurrentTab(); // probably unnecessary?
            if(this.tabExists(details.tabId)){
                this.tabs[details.tabId].removeShadowIfExists();
            }
            this.addTab(details.url, details.tabId);
            console.info("Cleared tab for " + details.url);

            notifyPopupOfReload();
        })
    }

     static onMessageRejected(error) {
        // All requests are send, but can only be received if popup is open. This error is a result of this.
        // We can just drop it
        if (error.toString().includes("Could not establish connection. Receiving end does not exist.")) {
            return;
        }
        // Any error printed from here is likely because the popup expected another format from the message
        console.error(error);
    }

    /**
     * On closing of a tab, we remove the contextual identity as well as the Shadow Tab
     * @param tabId
     */
    removeContainer(tabId) {
        if(this.tabExists(tabId) && this.tabs[tabId] instanceof OriginTab){
            this.tabs[tabId].removeShadowIfExists();
        }
    }

    /**
     * When a shadow tab has completed loading, all its cookies are available for comparison with the original request
     * It is necessary for some reason to wait a little longer
     * TODO: refactor
     */
    evaluateTab(tabId){
        if (this.tabs[tabId] instanceof ShadowTab) {
            this.tabs[this.tabs[tabId].originTab].evaluateRequests();
            //do it again after 2 seconds
            setTimeout(() => {
                this.tabs[this.tabs[tabId].originTab].evaluateRequests();
            }, 2000);
        } else if (this.tabs[tabId] instanceof OriginTab) {
            this.tabs[tabId].evaluateRequests();
        }
    }

    /**
     * logs all redirects the listener catches
     * @param responseDetails
     */
    logRedirect(responseDetails) {
        this.tabs[responseDetails.tabId].addRedirect(
            {id: responseDetails.requestId,
                origin: getSecondLevelDomainFromUrl(responseDetails.url),
                originUrl: responseDetails.url,
                destination: responseDetails.redirectUrl}
        );
    }

    /**
     *  creates new Response object for each request the listener catches
     * @param responseDetails
     */
    logResponse(responseDetails) {
        if(this.tabIsUndefined(responseDetails)) { return }
        if(this.tabs[responseDetails.tabId].integrateResponse(responseDetails)) return;
        this.tabs[responseDetails.tabId].createResponse(responseDetails);
    }

    /**
     * creates new Request object for each request the listener catches
     * @param requestDetails
     */
    logRequest(requestDetails) {
        if(this.tabIsUndefined(requestDetails)) { return }
        this.tabs[requestDetails.tabId].createWebRequest(requestDetails);
    }

    tabIsUndefined(requestDetails) {
        // this appears to happen a lot for Web Workers
        // I have no way of handling these, so I need to drop them
        if(requestDetails.tabId < 0 ) return true;

        // these leftover ones are often from bacground tabs that have not been initialized
        if(!this.tabExists(requestDetails.tabId)){
            console.warn("Undefined tab for request " + requestDetails.url + " of tab number " + requestDetails.tabId)
            return true;
        }
    }
}

browser.extension.isAllowedIncognitoAccess().then((isAllowedAccess) => {
    if (isAllowedAccess) return; // Great, we've got access

    browser.tabs.create({
        url: 'chrome://extensions/?id=' + browser.runtime.id
    });
});

var browserTabs


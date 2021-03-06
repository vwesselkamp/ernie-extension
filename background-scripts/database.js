/*
This file contains 3 different databases:
    1. IndexedDB for the safe cookies
    2. localStorage for the extension settings
    3. an external REST DB for the collected data
 */


/*
1. IndexedDB for the safe cookies
 */

// globally available db access
var db;

/*
The version determines if the database is updated. If the version already exist, it is simply opened. If the version is higher
than the current one, an upgrade event is triggered. In that event, the database schemas can be updated.
 */
const request = indexedDB.open("extension-db", 1);

/*
If this error occurs it most likely means that the database version is incorrect. Try reinstalling the popup,
which resets the current db version to 0, or raise the version number in the request above
 */
request.onerror = (e) => {
    console.warn("Error: Database could not be initialized");
    console.warn(e)
}

// db is successfully retrieved
request.onsuccess = (event) => {
    db = event.target.result
} ;

/**
 * When upgrade event is triggered, the database schemas can be updated and changed
 * @param event
 */
request.onupgradeneeded = function(event) {
    /**
     * An objectStore is a bit like a table in a normal database. Our database currently has only one, "cookies",
     * which contains all the "safe" cookies found by th extension over time.
     * The DB is either just updated or set up completely new, so we need to differentiate the two cases.
     * @returns {IDBObjectStore}
     */
    function initializeObjectStore() {
        try {
            // DB is setup completely new and we can freely set up our cookie store.
            // objectstore with autoincrementing key as we dont have a natural primary key for the cookies
            return db.createObjectStore("cookies", {autoIncrement: "true"});
        } catch (e) {
            // DB is only updated by raising the version number.
            // When updating the schema we cannot simply change the cookie store, it has to be deleted, and set up newly
            console.warn(e);
            db.deleteObjectStore("cookies");
            console.warn("Reinitializing object store cookies.")
            return db.createObjectStore("cookies", {autoIncrement: "true"});
        }
    }

    console.info("Database upgraded");
    db = event.target.result;

    const objectStore = initializeObjectStore();

    // Create an index to search cookies by url. We may have duplicates
    // so we can't use a unique index.
    objectStore.createIndex("domain", "domain", { unique: false });
};



/*
2. localStorage for configuration
 */

// Also handle external database access
let mongoDBUser;
let mongoDBPassword;
let originDBLocation;
let shadowDBLocation;
let mongoDBAccess = false;

/**
 * Sets the vars we need to access the DB by retrieving them from the local storage
 */
function setDatabaseAccess() {
    const originLocation = browser.storage.local.get('originLocation');
    originLocation.then((res) => {
        originDBLocation = res.location || 'http://localhost:8080/extension';
    }).catch(e => console.log(e));

    const shadowLocation = browser.storage.local.get('shadowLocation');
    shadowLocation.then((res) => {
        shadowDBLocation = res.location || 'http://localhost:8080/shadow-tabs';
    });

    const user = browser.storage.local.get('user');
    user.then((res) => {
        mongoDBUser = res.user || 'admin';
    });

    const password = browser.storage.local.get('password');
    password.then((res) => {
        mongoDBPassword = res.password || 'secret';
    });
}
browser.storage.onChanged.addListener(setDatabaseAccess);

setDatabaseAccess();



/*
3. External database
 */

//TODO
fetch("http://localhost:8080/ping")
    .then(response => response.text())
    .then(text => {
        if(text.includes("Greetings from RESTHeart!")){
            mongoDBAccess = true;
            console.log("MongoDB accessible")
        } else {
            console.warn("MongoDB inaccessible")
        }
    }).catch(e => console.log(e));

/**
 * We send a POST requests with the whole object as JSON in the body.
 * For fetch, the authorization need to be set in the header.
 * The content type defaults to application/text and must be manually set to json, or the restheart API doesn't accept it
 */
function sendTabToDB(tab) {
    function prepareHeader(){
        let headers = new Headers();
        headers.set('Authorization', 'Basic ' + btoa(mongoDBUser + ":" + mongoDBPassword));
        headers.set('Content-Type', 'application/json');
        return headers
    }

    if(!mongoDBAccess) return;
    console.log("Sending TAb with ID " + tab._id)
    let headers = prepareHeader()

    let shadowTab = browserTabs.getTab(tab.shadowTabId)
    tab.serialize()
    shadowTab.serialize()

    fetch(originDBLocation, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(tab)
    })

    fetch(shadowDBLocation, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(shadowTab)
    })
}
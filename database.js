var db;

const exampleCookies = [
    { url: "test.com", key: "uid", value: "cookie" },
    { url: "other.fr", key: "ts", value: "fjioeoij" }
];

// the version determines if the database is reinitaliyzed or updated
var request = indexedDB.open("extension-db", 1);

request.onerror = function(event) {
    console.log("error: ${event} " + event);
};
request.onsuccess = function(event) {
    db = event.target.result;
};

// database is constructed here
request.onupgradeneeded = function(event) {
    console.log("database upgraded");
    var db = event.target.result;

    // objectstore with autoincrementing key as we dont have a natural primary key for the cookies
    var objectStore = db.createObjectStore("cookies", { autoIncrement: "true" });

    // Create an index to search cookies by url. We may have duplicates
    // so we can't use a unique index.
    objectStore.createIndex("url", "url", { unique: false });

    // Use transaction oncomplete to make sure the objectStore creation is
    // finished before adding data into it.
    objectStore.transaction.oncomplete = function(event) {
        // Store values in the newly created objectStore.
        var cookieObjectStore = db.transaction("cookies", "readwrite").objectStore("cookies");
        exampleCookies.forEach(function(cookie) {
            cookieObjectStore.add(cookie);
        });
    };
};
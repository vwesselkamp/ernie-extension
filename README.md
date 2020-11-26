# Firefox Extension
## To use
Got to about:debugging in Firefox and add choose "Load temporary add-on", then choose any file from the extension.

The extension has a pop up window that appears when you click on the little policeman.
### How it works
For every visit to a page that you do, while the extension is active, there is a second visit happening in the background, in what I call the "shadow tab". The point of this second visit is to be able to determine, which cookies are ID cookies.   
This works, because the second visit in the "shadow tab" is done form a different container (in Firefox a "contextual identity"),  which has its own cookie store. If we now compare the cookies set in the foreground tab, and the ones form the shadow tab, and we find a cookie with the same key but a different value, we can guess that this cookie can be used to track you.   
With this information, I can then analyse the requests send and categorise them as in Imanes paper.   

Because the shadow tab is a different container, on visiting a page and accepting the cookie banner, it is also necessary to visit the shadow tab and do the same action there (if you want the cookies that are set to be comparable). In the version that you are using, this is neccessary EVERY TIME you visit a page, even if in the foreground tab, and your normal browsing profile, you have already accepted the cookie banner, because the extension has a different container every time you visit the website.   
In the much improved version that I am using, the shadow containers are all merged into one, and you only have to accept the banner in the background tab once, much like in your normal browsing profile. This version is on the branch "doctors" in the same repo. However, that version also has some functionality that I use for my analysis of doctors websites, and the layout is not very pretty. You can still use that one though, if you don't find it too confusing.

An additional tipp: The extension is by default in "debug mode" (helped me a lot during development). If you want a popup that's a bit clearer, but doesn't carry  as much information, you can turn it to normal mode, if you go to about:addons, and into the extensions settings

### Database
After analyzing a webpage, the extension will try to write the results to a local mongoDB via [restheart] (https://restheart.org/).
Restheart is a Java Program which exposes a local REST API for our mongoDB. 
If the extension cannot find a local mongoDB instance, it will not try to write to it, and the collected data will be lost when the tab is closed.

There is an API to access the IndexedDB of the browser from within the extension, however, the data in that DB can only be read by the creator (the extension) and is not accessible from outside the browser.
As I don't know how we are going to process the collected data, I chose to use an external database.

#### Set Up Database
Install mongoDB and restheart as described in their documentation. The default access is admin: secret.

To initialize the DB for the first time, run ```curl --user admin:secret -I -X PUT localhost:8080/```.   
To initialize the collection, run ```curl --user admin:secret -I -X PUT localhost:8080/extension```.

I intend to write a small script for this.

#### Using mongoDB
To access the data written by the extension, execute ```mongo``` to access the mongo shell.
Run ```use restheart``` to switch to our database.

To query for any visit that had tracking request, run ```db.extension.find( { "requests": { $elemMatch: { "category": "tracking"} } },{"domain": 1} )```   
To remove all data from our collection run ```db.extension.remove({})```
   
### Notes
The library for the public suffix list is this: https://github.com/lupomontero/psl  
It has last been updated in March. There exist alternatives where you can plug in the current list on your own.
### Resources
Trello Board: https://trello.com/b/EJ9rqFBZ   
Overleaf Documentation: https://de.overleaf.com/read/zyxspkfyqmwp
# Ernie Extension
## Install in Firefox
Go to about:addons -> Manage your extension -> Install extension from file.
You will get a warning that it has not been signed, which you can ignore.

## Install in Chrome
Go to chrome://extensions and drag and drop the crx file into the window. The extension should install.
Additionally set the following things:
* Go to chrome://settings/cookies and allow all cookies. The difference to the default mode is that now, in the incognito 
mode, 3rd party cookies can be set by websites. When not using the extension, remember to disable this setting.
* Go to the setting page of the extension. Choose "allow in incognito mode". An incognito window should open in the background
immediately

## How it works
For every visit to a page that you do, while the extension is active, there is a second visit happening in the background, 
in what I call the "shadow tab". The point of this second visit is to be able to determine, which cookies are ID cookies.   
The second visit in the "shadow tab" is performed in a different container (in Firefox a "contextual identity", in Chrome
an incognito tab), which has its own cookie store. If we now compare the cookies set in the foreground tab and the ones 
from the shadow tab and we find a cookie with the same key but a different value, we can estimate that this cookie can be used to track you.   

Because the shadow tab is a different container, on visiting a page and accepting the cookie banner, it is also necessary 
to visit the shadow tab and do the same action there (if you want the cookies that are set to be comparable). 

### Building shadow profile in Chrome
If you want to retain the cookies and data build in the shadow container of the Chrome tab (the incognito window), even 
after disabling the extension or closing the browser, you explicetly need to state though.

For this purpose, there is a button called "Save shadow cookies" in the popup. Click it before closing the window. The data
will be saved to the extensions database and loaded into the incognito tab the next time you use the extension.

### Color codes:
TODO

## Database 
After analyzing a webpage, the extension will try to write the results to a local mongoDB via [restheart] (https://restheart.org/).
Restheart is a Java Program which exposes a local REST API for our mongoDB. 
If the extension cannot find a local mongoDB instance, it will not try to write to it, and the collected data will be lost when the tab is closed.

#### Set Up Database
Install mongoDB and restheart as described in their documentation. The default access is admin: secret.

To initialize the DB for the first time, run ```curl --user admin:secret -I -X PUT localhost:8080/```.   
To initialize the default collection, run ```curl --user admin:secret -I -X PUT localhost:8080/extension``` and 
```curl --user admin:secret -I -X PUT localhost:8080/shadow-extension```. Those locations can be set in the options interface
of the extension.

#### Using mongoDB
To access the data written by the extension, execute ```mongo``` to access the mongo shell.
Run ```use restheart``` to switch to our database.

To query for any visit that had tracking request, run ```db.extension.find( { "requests": { $elemMatch: { "category": "tracking"} } },{"domain": 1} )```   
To remove all data from our collection run ```db.extension.remove({})```
   
Alternatively use MongoDBCompass.
### Notes
The library for the public suffix list is this: https://github.com/lupomontero/psl  
It has last been updated in March 2020. There exist alternatives where you can plug in the current list on your own.

### Resources
Trello Board: https://trello.com/b/EJ9rqFBZ   
Overleaf Documentation: https://de.overleaf.com/read/zyxspkfyqmwp
# one.smiler.models

## Getting started

### In general

-   Download and install
    -   [node.js](https://nodejs.org/en/download/current/)
    -   [git](https://git-scm.com/downloads)
-   A Github account authenticated with a ssh key pair
-   Access to
    -   github.com/refinio/one.core

```bash
git clone https://github.com/refinio/one.smiler.models
cd one.smiler.models
yarn install
```
## Starting the example

Nothing to see here, yet

## Project structure in general

-   Source files go into the **/src** folder.
-   Test files into **/test** folder.
-   They will both be process by **build.js** and the .ts files will be transpiled into the **/lib** folder
-   ONE plan modules into **/src/plan_modules** they are compiled with **/build_plan_modules.js**

## Style

As said we use TypeScript above JavaScript ES6 meaning we use **import**,**export** statements
instead of require. And have the newest javascript features available

Additional we use **prettier.js** for automatic code styling. Here you should also copy an existing
**.prettierc** form an existing project.

Most modern IDEs support to file watchers which then can execute scripts on changes.
Setup **prettier.js** and **build.js** te be run on file changes.

## TypeScript

The file **@OneCoreTypes.d.ts** defines the types this project uses as well as exports

## Misc

I added a lsone.sh file. It lists the contents of the one database in human readable format.
Requirements: bash, sed and tidy and a console that understands ansi colors.

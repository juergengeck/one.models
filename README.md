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
## About the project

Main models used in one built in one package

## Project structure in general

-   Source files go into the **/src** folder.
-   Test files into **/test** folder.
-   They will both be process by **build.js** and the .ts files will be transpiled into the **/lib** folder
-   ONE plan modules into **/src/plan_modules** they are compiled with **/build_plan_modules.js**

```
 src
 │   i18n.ts
 │
 ├───generated
 │       oneModules.ts
 │
 ├───models
 │   │   BodyTemperatureModel.ts
 │   │   ChannelManager.ts
 │   │   ConnectionsModel.ts
 │   │   ConsentFileModel.ts
 │   │   ContactModel.ts
 │   │   DiaryModel.ts
 │   │   DocumentModel.ts
 │   │   HeartEventModel.ts
 │   │   index.ts
 │   │   JournalModel.ts
 │   │   NewsModel.ts
 │   │   OneInstanceModel.ts
 │   │   QuestionnaireModel.ts
 │   │   SettingsModel.ts
 │   │   WbcDiffModel.ts
 │   │
 │   └───utils
 │           QuestionnaireAEK.ts
 │           QuestionnaireAES.ts
 │           QuestionnaireEQ5D3L.ts
 │           QuestionnaireFKP.ts
 │           QuestionnaireFKV.ts
 │           QuestionnaireFSM.ts
 │           QuestionnaireFSV.ts
 │           QuestionnaireGKM.ts
 │           QuestionnaireGKV.ts
 │           QuestionnaireIKP.ts
 │           QuestionnaireIKV.ts
 │           QuestionTypes.ts
 │
 └───recipies
         BodyTemperatureRecipies.ts
         ChannelRecipies.ts
         ConsentFileRecipies.ts
         ContactRecipies.ts
         DiaryRecipies.ts
         MetaRecipies.ts
         QuestionnaireRecipies.ts
         recipies.ts
         SettingsRecipe.ts
```

## Test coverage
```
-------------------------|---------|----------|---------|---------|-----------------------------
File                     | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------------|---------|----------|---------|---------|-----------------------------
All files                |   31.44 |    13.07 |   28.57 |   33.14 |
 BodyTemperatureModel.js |      36 |        0 |   16.67 |      36 | 15-19,33-59
 ChannelManager.js       |   17.74 |        0 |    6.25 |   17.74 | 21,31-151
 ConnectionsModel.js     |    7.17 |        0 |    3.13 |    7.84 | 24-26,38-433
 ConsentFileModel.js     |   19.72 |       10 |    12.5 |   25.93 | 16-18,29-37,51-133
 ContactModel.js         |   91.36 |    84.21 |   88.68 |   91.95 | 70-77,85,88,110,221,228,347
 DiaryModel.js           |      22 |        0 |    7.69 |   33.33 | 18-30,41-81
 DocumentModel.js        |   63.64 |      100 |      20 |   63.64 | 19-29
 HeartEventModel.js      |   66.67 |      100 |      40 |   66.67 | 26-33
 JournalModel.js         |   31.52 |     7.14 |      20 |   31.87 | 36,39,42,45,48,51,54-175
 NewsModel.js            |   15.52 |        0 |    8.33 |   15.79 | 22-134
 OneInstanceModel.js     |   25.35 |    11.76 |   12.12 |   26.28 | 48-52,77-263,277-284
 QuestionnaireModel.js   |   25.58 |        0 |    6.25 |   31.88 | 38-40,47-76,89-166
 SettingsModel.js        |   36.36 |    11.11 |   17.65 |   36.36 | 32-56,65-72,84,94-143
 WbcDiffModel.js         |   12.07 |        0 |      25 |   12.07 | 19-119
-------------------------|---------|----------|---------|---------|-----------------------------
```

## Style

As said we use TypeScript above JavaScript ES6 meaning we use **import**,**export** statements
instead of require. And have the newest javascript features available

Additional we use **prettier.js** for automatic code styling. Here you should also copy an existing
**.prettierc** form an existing project.

Most modern IDEs support to file watchers which then can execute scripts on changes.
Setup **prettier.js** and **build.js** te be run on file changes.

## TypeScript

The file **@OneCoreTypes.d.ts** defines the types this project uses as well as exports

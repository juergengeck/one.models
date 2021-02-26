/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {expect} from 'chai';
import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import TestModel, {dbKey, importModules, removeDir} from './utils/TestModel';
import {QuestionnaireModel} from '../lib/models';

let testModel: TestModel;

describe('Questionnaire model test', () => {
    before(async () => {
        // TODO: clean test initialization up!
        await StorageTestInit.init({dbKey: dbKey, deleteDb: false});
        await registerRecipes([...RecipesStable, ...RecipesExperimental]);
        await importModules();
        const model = new TestModel('ws://localhost:8000', dbKey);
        await model.init(undefined);
        testModel = model;
    });

    after(async () => {
        await testModel.shutdown();
        closeInstance();
        await StorageTestInit.deleteTestDB();
        await removeDir(`./test/${dbKey}`);
    });

    it('post a questionnaire reponse', async () => {
        const qm = new QuestionnaireModel(testModel.channelManager);
        await qm.init();

        // Register a questionnaire
        await qm.registerQuestionnaires([
            {
                $type$: 'Questionnaire',
                resourceType: 'Questionnaire',
                language: 'de',
                url: 'http://refinio.one/test/questionaire/irgendetwas',
                name: 'irgendetwas',
                status: 'active',
                item: [
                    {
                        linkId: 'link1',
                        prefix: 'pre1',
                        text: 'Geben Sie irgendein Datum und irgendeine Uhrzeit ein',
                        type: 'date'
                    },
                    {
                        linkId: 'link2',
                        prefix: 'pre2',
                        text: 'Wählen Sie irgendetwas aus',
                        type: 'choice',
                        answerOption: [
                            {
                                valueCoding: {
                                    system: 'http://refinio.one/test/valueCoding/irgendetwas',
                                    version: '1.0',
                                    code: '0',
                                    display: 'Nichts'
                                }
                            },
                            {
                                valueCoding: {
                                    system: 'http://refinio.one/test/valueCoding/irgendetwas',
                                    version: '1.0',
                                    code: '1',
                                    display: 'irgendetwas'
                                }
                            },
                            {
                                valueCoding: {
                                    system: 'http://refinio.one/test/valueCoding/irgendetwas',
                                    version: '1.0',
                                    code: '2',
                                    display: 'Alles'
                                }
                            }
                        ]
                    },
                    {
                        linkId: 'link3',
                        prefix: 'pre3',
                        text: 'Geben Sie irgendetwas ein',
                        type: 'string'
                    }
                ]
            }
        ]);

        // Post the questionnaires
        await qm.postResponseCollection(
            [
                {
                    resourceType: 'QuestionnaireResponse',
                    questionnaire: 'http://refinio.one/test/questionaire/irgendetwas',
                    status: 'completed',
                    item: [
                        {linkId: 'link1', answer: [{valueDate: '2020-15-07T00:10'}]},
                        {
                            linkId: 'link2',
                            answer: [
                                {
                                    valueCoding: {
                                        system: 'http://refinio.one/test/valueCoding/irgendetwas',
                                        version: '1.0',
                                        code: '1'
                                    }
                                }
                            ]
                        },
                        {
                            linkId: 'link3',
                            answer: [
                                {
                                    valueString: 'irgendetwas'
                                }
                            ]
                        }
                    ]
                }
            ],
            'name',
            'type'
        );

        // Read the questionnaires
        const responses = await qm.responses();
        expect(responses.length).to.be.equal(1);

        await qm.shutdown();
    });
});

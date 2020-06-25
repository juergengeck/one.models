import {Questionnaire} from './QuestionTypes';

/**
 * Questionnaire AES
 */
const QuestionnaireAES: Questionnaire = {
    identifier: 'AES',
    item: [
        /*  {
            questionIdentifier: 'AES1.1',
            question: 'In welchem Jahr sind Sie geboren?',
            questionType: QuestionType.Birthday,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES1.2',
            question: 'Sind Sie heute älter als 18 Jahre?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES2.1',
            question: 'Wann wurden Sie auf eine SARS-CoV-2 Infektion positiv getestet?',
            questionType: QuestionType.Date,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES2.2',
            question: 'Wurden Sie bereits 2-mal negativ auf die SARS-CoV-2 Infektion getestet?',
            questionType: QuestionType.Boolean,
            subQuestions: [
                {
                    requiredAnswer: 'Ja',
                    subQuestion: ['AES9', 'AES10', 'AES11']
                }
            ],
            isOpen: false,
            issubQuestion: false
        },

        {
            questionIdentifier: 'AES3',
            question:
                'Ich bin damit einverstanden, dass meine Vertrauensperson alle folgenden\n' +
                'Fragen an meiner Stelle beantwortet, falls ich selbst nicht dazu in der Lage\n' +
                'sein sollte.',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES4',
            question: 'Besteht bei Ihnen aktuell eine Schwangerschaft',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES4.1',
            question: 'Die wievielte Schwangerschaft ist dies?',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES4.2',
            question: 'Wie viele Kinder haben Sie bereits geboren?',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES4.3',
            question: 'In welcher Schwangerschaftswoche (SSW) befinden Sie sich aktuell?',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES4.4',
            question: 'Besteht bei Ihnen eine Mehrlingsschwangerschaft?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES5.1',
            question: 'Sind Sie gegen Influenza geimpft worden?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {requiredAnswer: 'Ja/Weiß nicht', subQuestion: ['AES5.2']},
                {
                    requiredAnswer: 'Nein',
                    subQuestion: []
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES5.2',
            question: 'Wenn ja, in welchem Jahr sind Sie zuletzt gegen Influenza geimpft worden?',
            questionType: QuestionType.MultipleInputQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES5.1', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES6.1',
            question: 'Sind Sie gegen Pneumokokken geimpft worden?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {requiredAnswer: 'Ja/Weiß nicht', subQuestion: ['AES6.2']},
                {
                    requiredAnswer: 'Nein',
                    subQuestion: []
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES6.2',
            question:
                'Wenn ja, in welchem Jahr sind Sie zuletzt gegen Pneumokokken geimpft worden?',
            questionType: QuestionType.MultipleInputQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES6.1', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7',
            question:
                'Haben Sie neben der SARS-CoV-2-Infektion andere Erkrankungen oder sind Ihnen Vorerkrankungen bekannt?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: ['AES7.1,AES7.2,AES7.3,AES7.4,AES7.5,AES7.6,AES7.7']
                },
                {
                    requiredAnswer: 'Nein',
                    subQuestion: []
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES7.1',
            question: 'Herz-Kreislauf-Erkrankungen',
            questionType: QuestionType.BasicQuestion,
            isOpen: false,
            subQuestions: [],
            issubQuestion: true,
            enableWhen: [{question: 'AES7', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7.2',
            question: 'Lungenerkrankungen',
            questionType: QuestionType.BasicQuestion,
            isOpen: false,
            subQuestions: [],
            issubQuestion: true,
            enableWhen: [{question: 'AES7', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7.3',
            question: 'Chronische Lebererkrankungen',
            questionType: QuestionType.BasicQuestion,
            isOpen: false,
            subQuestions: [],
            issubQuestion: true,
            enableWhen: [{question: 'AES7', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7.4',
            question: 'Diabetes Typ1 oder Typ 2',
            questionType: QuestionType.BasicQuestion,
            isOpen: false,
            subQuestions: [],
            issubQuestion: true,
            enableWhen: [{question: 'AES7', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7.5',
            question: 'Krebs',
            questionType: QuestionType.BasicQuestion,
            enableWhen: [{question: 'AES7', operator: '!=', answer: 'Nein'}],
            isOpen: false,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: ['AES7.5_1,AES7.5.2,AES7.5.3,AES7.5.4,AES7.5.5,AES7.5.6']
                },
                {
                    requiredAnswer: 'Nein',
                    subQuestion: []
                }
            ],
            issubQuestion: true
        },
        {
            questionIdentifier: 'AES7.5_1',
            question: 'Um welche Krebserkrankung handelt es sich (Organ)?',
            questionType: QuestionType.Caption,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES7.5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7.5.2',
            question: 'Lunge?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES7.5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7.5.3',
            question: 'Haut?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES7.5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7.5.4',
            question: 'Blut?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES7.5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7.5.5',
            question: 'Brust?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES7.5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7.5.6',
            question: 'Sonstige',
            questionType: QuestionType.Text,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES7.5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7.6',
            question: 'Immunschwächeerkrankung',
            questionType: QuestionType.BasicQuestion,
            isOpen: false,
            subQuestions: [],
            issubQuestion: true,
            enableWhen: [{question: 'AES7', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES7.7',
            question: 'Sonstige',
            questionType: QuestionType.Text,
            isOpen: false,
            subQuestions: [],
            issubQuestion: true,
            enableWhen: [{question: 'AES7', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES8.1',
            question: 'Sind/waren Sie Raucher?',
            questionType: QuestionType.BasicQuestion,
            isOpen: false,
            subQuestions: [
                {
                    requiredAnswer: 'Ja',
                    subQuestion: ['AES8.2,AES8.3']
                },
                {
                    requiredAnswer: 'Nein',
                    subQuestion: []
                }
            ],
            issubQuestion: false
        },
        {
            questionIdentifier: 'AES8.2',
            question: 'Anzahl Zigaretten pro Tag',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES8.1', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES8.3',
            question: 'Jahre',
            questionType: QuestionType.Year,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES8.1', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES9',
            question:
                'Waren Sie aufgrund Ihrer zurückliegenden SARS-CoV-2-Infektion in stationärer Behandlung?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {requiredAnswer: 'Ja/Weiß nicht', subQuestion: ['AES9_1,AES9.2,AES9.3,AES9.4']},
                {
                    requiredAnswer: 'Nein',
                    subQuestion: []
                }
            ],
            isOpen: false,
            issubQuestion: false,
            enableWhen: [{question: 'AES2.2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'AES9_1',
            question: 'Auf welcher Art von Station wurden Sie behandelt?',
            questionType: QuestionType.Caption,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES9', operator: '!=', answer: 'Ja/Weiß nicht'}]
        },
        {
            questionIdentifier: 'AES9.2',
            question: 'Intensivstation',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES9', operator: '!=', answer: 'Ja/Weiß nicht'}]
        },

        {
            questionIdentifier: 'AES9.3',
            question: 'Isolierstation/Infektionsstation',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES9', operator: '!=', answer: 'Ja/Weiß nicht'}]
        },
        {
            questionIdentifier: 'AES9.4',
            question: 'Sonstige',
            questionType: QuestionType.Text,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES9', operator: '!=', answer: 'Ja/Weiß nicht'}]
        },
        {
            questionIdentifier: 'AES10',
            question:
                'Erhielten Sie aufgrund der SARS-CoV-2 Infektion eine Behandlung ? (Mehrfachnennungen möglich)',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: ['AES10.1,AES10.2,AES10.3,AES10.4,AES10.5,AES10.6,AES10.7,AES10.8']
                },
                {
                    requiredAnswer: 'Nein',
                    subQuestion: []
                }
            ],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES2.2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'AES10.1',
            question: 'Bekamen Sie zusätzlich Sauerstoff?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES10', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES10.2',
            question: 'Wurde Ihr Flüssigkeitshaushalt z.B. durch eine Infusion ausgeglichen?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES10', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES10.3',
            question: 'Wurde bei Ihnen eine Lungenentzündung (Pneumonie) diagnostiziert?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES10', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES10.4',
            question: 'Erhielten Sie Antibiotika?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES10', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES10.5',
            question: 'Wurden/werden Sie mit Quensly Hydroxychloroquin behandelt?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES10', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES10.6',
            question: 'Wurden Sie künstlich beatmet (Intubation)? ',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES10', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES10.7',
            question:
                'Wurde bei Ihnen eine Beatmung mit einer „Herz-Lungenmaschine“ (extrakorporaler Membranoxygenierung = ECMO) durchgeführt?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES10', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES10.8',
            question: 'Wurde bei Ihnen ein akutes Lungenversagen (ARDS) diagnostiziert?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES10', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'AES11',
            question: 'Wurden Sie von Ihrem Partner getrennt, um eine Ansteckung zu verhindern?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'AES2.2', operator: '=', answer: 'Ja'}]
        }*/
    ]
};

export default QuestionnaireAES;

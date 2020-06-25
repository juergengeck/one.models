import {Questionnaire} from './QuestionTypes';

/**
 * Questionnaire FSV
 */
const QuestionnaireFSV: Questionnaire = {
    identifier: 'FSV',
    item: [
        /* {
            questionIdentifier: 'FSV1.1',
            question:
                'Wurde die betroffene Person aktuell 2-mal negativ auf die SARS-CoV-2 Infektion getestet?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSV1.2',
            question: 'Hat die Geburt des Kindes bereits stattgefunden?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSV1.3',
            question: 'Ist die Studienteilnehmerin noch am Leben?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Nein',
                    subQuestion: ['FSV1.4']
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSV1.4',
            question: 'Wann ist die Studienteilnehmerin verstorben?',
            questionType: QuestionType.Year,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV1.3', operator: '=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV2',
            question:
                'Sind bei der Schwangeren (aktuell) Schwangerschaftskomplikationen erkrankungen aufgetreten?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja',
                    subQuestion: [
                        'FSV2.1',
                        'FSV2.2',
                        'FSV2.3',
                        'FSV2.4',
                        'FSV2.5',
                        'FSV2.6',
                        'FSV2.7'
                    ]
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSV2.1',
            question: 'Schwangerendiabetes?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSV2.2',
            question: 'Präeklampsie?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSV2.3',
            question: 'Bluthochdruck?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSV2.4',
            question: 'HELLP-Syndrom?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSV2.5',
            question: 'Intrauterine Wachstumsrestriktion (IUGR)?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSV2.6',
            question: 'Intrauteriner Fruchrod Totgeburt (IUFT)?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSV2.7',
            question: 'Blasensprung?',
            questionType: QuestionType.BasicQuestion,
            isOpen: false,
            issubQuestion: true,
            subQuestions: [
                {
                    requiredAnswer: 'Ja',
                    subQuestion: ['FSV2.7.1']
                }
            ],
            enableWhen: [{question: 'FSV2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSV2.7.1',
            question: 'In welcher Schwangerschaftswoche (SSW)?',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV2.7', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSV3',
            question: 'Ist/War die Studienteilnehmerin Raucherin?',
            questionType: QuestionType.Boolean,
            subQuestions: [
                {
                    requiredAnswer: 'Ja',
                    subQuestion: ['FSV3.1,FSV3.2']
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSV3.1',
            question: 'Anzahl Zigaretten pro Tag?',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV3', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSV3.2',
            question: 'Jahre',
            questionType: QuestionType.Year,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV3', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSV4',
            question:
                'Leidet die Studienteilnehmerin aktuell unter Symptomen aufgrund der SARS-CoV-2 Infektion?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: [
                        'FSV4_1',
                        'FSV4.1',
                        'FSV4.2',
                        'FSV4.3',
                        'FSV4.4',
                        'FSV4.5',
                        'FSV4.6',
                        'FSV4.7',
                        'FSV4.8',
                        'FSV4.9',
                        'FSV4.10',
                        'FSV4.11',
                        'FSV4.12',
                        'FSV4.13',
                        'FSV4.14',
                        'FSV4.15'
                    ]
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSV4_1',
            question: 'Unter welchen der folgenden Symptomen leidet Sie?',
            questionType: QuestionType.Caption,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.1',
            question: 'Fieber (über 38,5°C)?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.2',
            question: 'Kopf- und Gliederschmerzen?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.3',
            question: 'Muskel- und Gelenkschmerzen?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.4',
            question: 'Kurzatmigkeit/Atemlosigkeit?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.5',
            question: 'Trockener Husten?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.6',
            question: 'Husten (mit Auswurf)?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.7',
            question: 'Halsschmerzen?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.8',
            question: 'Schnupfen?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.9',
            question: 'Lymphknotenschwellung?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.10',
            question: 'Geschmacksverlust?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.11',
            question: 'Übelkeit?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.12',
            question: 'Erbrechen?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.13',
            question: 'Durchfall?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.14',
            question: 'Müdigkeit?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV4.15',
            question: 'Andere Symptome?',
            questionType: QuestionType.Text,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV5',
            question:
                'Ist die Studienteilnehmerin aktuell aufgrund der SARS-CoV-2-Infektion oder der Schwangerschaft in stationärer Behandlung ?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: ['FSV5_1', 'FSV5.1', 'FSV5.2', 'FSV5.3', 'FSV5.4', 'FSV5.5']
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSV5_1',
            question: 'Auf welcher Art von Station werden Sie behandelt?',
            questionType: QuestionType.Caption,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV5.1',
            question: 'Intensivstation',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV5.2',
            question: 'Isolierstation/Infektionsstation',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV5.3',
            question: 'Geburthilfliche Station?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV5.4',
            question: 'Sonstige ',
            questionType: QuestionType.Text,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV6',
            question:
                'Erhält Sie aktuell aufgrund der SARS-CoV-2 Infektion eine Behandlung ? (Mehrfachnennungen möglich)',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: [
                        'FSV6.1',
                        'FSV6.2',
                        'FSV6.3',
                        'FSV6.4',
                        'FSV6.5',
                        'FSV6.6',
                        'FSV6.6',
                        'FSV6.7',
                        'FSV6.8'
                    ]
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSV6.1',
            question: 'Bekommt Sie zusätzlich Sauerstoff?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV6.2',
            question: 'Wird Ihr Flüssigkeitshaushalt z.B. durch eine Infusion ausgeglichen?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV6.3',
            question: 'Wurde bei Ihr eine Lungenentzündung (Pneumonie) diagnostiziert?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV6.4',
            question: 'Erhalten Sie Antibiotika?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV6.5',
            question: 'Werden/wurden Sie mit Quensly/Hydroxychloroquin behandelt?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV6.6',
            question: 'Wurden Sie künstlich beatmet (Intubation)?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV6.7',
            question:
                'Wurde bei Ihnen eine Beatmung mit einer „HerzLungenmaschine (extrakorporaler Membranoxygenierung =ECMO) durchgeführt?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV6.8',
            question: 'Wurde bei Ihr ein akutes Lungenversagen (ARDS) diagnostiziert?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSV6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSV7',
            question:
                'Ist die Studienteilnehmerin von ihrem Partner getrennt, um eine Ansteckung mit COVID-19 zu verhindern?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        }*/
    ]
};

export default QuestionnaireFSV;

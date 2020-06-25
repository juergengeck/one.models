import {Questionnaire} from './QuestionTypes';

/**
 * Questionnaire FSM
 */
const QuestionnaireFSM: Questionnaire = {
    identifier: 'FSM',
    item: [
        /* {
            questionIdentifier: 'FSM1.1',
            question: 'Wurden Sie aktuell 2-mal negativ auf die SARS-CoV-2 Infektion getestet?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSM1.2',
            question: 'Hat die Geburt Ihres Kindes bereits stattgefunden?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSM2',
            question:
                'Sind bei Ihnen (aktuell) Schwangerschaftskomplikationen erkrankungen aufgetreten?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja',
                    subQuestion: [
                        'FSM2.1',
                        'FSM2.2',
                        'FSM2.3',
                        'FSM2.4',
                        'FSM2.5',
                        'FSM2.6',
                        'FSM2.7'
                    ]
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSM2.1',
            question: 'Schwangerendiabetes?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSM2.2',
            question: 'Präeklampsie?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSM2.3',
            question: 'Bluthochdruck?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSM2.4',
            question: 'HELLP-Syndrom?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSM2.5',
            question: 'Intrauterine Wachstumsrestriktion (IUGR)?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSM2.6',
            question: 'Intrauteriner Fruchttod Totgeburt (IUFT)?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSM2.7',
            question: 'Blasensprung?',
            questionType: QuestionType.BasicQuestion,
            isOpen: false,
            issubQuestion: true,
            subQuestions: [
                {
                    requiredAnswer: 'Ja',
                    subQuestion: ['FSM2.7.1']
                }
            ],
            enableWhen: [{question: 'FSM2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSM2.7.1',
            question: 'In welcher Schwangerschafts woche (SSW)?',
            questionType: QuestionType.Number,
            subQuestions: [
                {
                    requiredAnswer: 'Ja',
                    subQuestion: ['FSM3.1,FSM3.2']
                }
            ],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM2.7', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSM3',
            question: 'Sind/waren Sie Raucher?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSM3.1',
            question: 'Anzahl Zigaretten pro Tag?',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM3', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSM3.2',
            question: 'Jahre',
            questionType: QuestionType.Year,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM3', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'FSM4',
            question: 'Leiden Sie aktuell unter Symptomen aufgrund der SARS-CoV-2-Infektion?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: [
                        'FSM4_1',
                        'FSM4.1',
                        'FSM4.2',
                        'FSM4.3',
                        'FSM4.4',
                        'FSM4.5',
                        'FSM4.6',
                        'FSM4.7',
                        'FSM4.8',
                        'FSM4.9',
                        'FSM4.10',
                        'FSM4.11',
                        'FSM4.12',
                        'FSM4.13',
                        'FSM4.14',
                        'FSM4.15'
                    ]
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSM4_1',
            question: 'Unter welchen der folgenden Symptomen leiden Sie?',
            questionType: QuestionType.Caption,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.1',
            question: 'Fieber (über 38,5°C)?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.2',
            question: 'Kopf- und Gliederschmerzen?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.3',
            question: 'Muskel- und Gelenkschmerzen?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.4',
            question: 'Kurzatmigkeit/Atemlosigkeit?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.5',
            question: 'Trockener Husten?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.6',
            question: 'Husten (mit Auswurf)?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.7',
            question: 'Halsschmerzen?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.8',
            question: 'Schnupfen?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.9',
            question: 'Lymphknotenschwellung?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.10',
            question: 'Geschmacksverlust?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.11',
            question: 'Übelkeit?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.12',
            question: 'Erbrechen?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.13',
            question: 'Durchfall?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.14',
            question: 'Müdigkeit?',
            questionType: QuestionType.Boolean,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM4.15',
            question: 'Andere Symptome?',
            questionType: QuestionType.CombinedQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM4', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM5',
            question:
                'Sind Sie aktuell aufgrund der SARS-CoV-2 Infektion oder der Schwangerschaft in stationärer Behandlung?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: ['FSM5_1', 'FSM5.1', 'FSM5.2', 'FSM5.3', 'FSM5.4', 'FSM5.5']
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSM5_1',
            question: 'Auf welcher Art von Station werden Sie behandelt?',
            questionType: QuestionType.Caption,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM5.1',
            question: 'Intensivstation',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM5.2',
            question: 'Isolierstation/Infektionsstation',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM5.3',
            question: 'Geburthilfliche Station?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM5.4',
            question: 'Sonstige ',
            questionType: QuestionType.Text,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM6',
            question:
                'Erhalten Sie aktuell aufgrund der SARS-CoV-2 Infektion eine Behandlung ? (Mehrfachnennungen möglich)',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: [
                        'FSM6.1',
                        'FSM6.2',
                        'FSM6.3',
                        'FSM6.4',
                        'FSM6.5',
                        'FSM6.6',
                        'FSM6.6',
                        'FSM6.7',
                        'FSM6.8'
                    ]
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'FSM6.1',
            question: 'Bekommen Sie zusätzlich Sauerstoff?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM6.2',
            question: 'Wird Ihr Flüssigkeitshaushalt z.B. durch eine Infusion ausgeglichen?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM6.3',
            question: 'Wurde bei Ihnen eine Lungenentzündung (Pneumonie) diagnostiziert?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM6.4',
            question: 'Erhalten Sie Antibiotika?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM6.5',
            question: 'Werden/wurden Sie mit Quensly/Hydroxychloroquin behandelt?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM6.6',
            question: 'Wurden Sie künstlich beatmet (Intubation)?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM6.7',
            question:
                'Wurde bei Ihnen eine Beatmung mit einer „HerzLungenmaschine (extrakorporaler Membranoxygenierung =ECMO) durchgeführt?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM6.8',
            question: 'Wurde bei Ihnen ein akutes Lungenversagen (ARDS) diagnosHziert?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'FSM6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FSM7',
            question: 'Sind Sie von Ihrem Partner getrennt, um eine Ansteckung zu verhindern?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        }*/
    ]
};

export default QuestionnaireFSM;

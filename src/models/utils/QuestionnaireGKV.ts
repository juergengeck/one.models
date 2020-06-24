import {Questionnaire} from './QuestionTypes';

/**
 * Questionnaire GKV
 */
const QuestionnaireGKV: Questionnaire = {
    identifier: 'GKV',
    item: [
        /*  {
            questionIdentifier: 'GKV1.1',
            question: 'In welcher Schwangerschaftswoche wurde das Kind geboren?',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'GKV1.2',
            question: 'Wie war die Apgar-Zahl bei Geburt? (Zu finden im Murerpass S. 15)',
            questionType: QuestionType.Birthday,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'GKV1.3',
            question:
                'Wie war der pH-Wert der Nabelarterie bei Geburt ? (Zu finden im Murerpass S. 15)',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'GKV2.1',
            question: 'Wurde das Kind bei der Geburt positiv auf SARS-CoV-2 getestet?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Nein/Weiß nicht',
                    subQuestion: ['GKV2.2']
                }
            ],
            isOpen: false,
            issubQuestion: false
        },

        {
            questionIdentifier: 'GKV2.2',
            question:
                'Wurde bei dem Kind zu einem späteren Zeitpunkt positiv auf SARS-CoV-2 getestet?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKV2.1', operator: '!=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'GKV3',
            question:
                'Musste das Kind aufgrund der SARS-CoV-2\n' +
                'Infektion stationär in einer Klinik behandelt\n' +
                'werden? ',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: ['GKV3.1,GKV3.2']
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'GKV3.1',
            question:
                'Für wie viele Tage musste das\n' +
                'Kind aufgrund der Infektion\n' +
                'stationär behandelt werden?',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKV3', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKV3.2',
            question:
                'War während der stationären\n' +
                'Behandlung des Kindes eine\n' +
                'Beatmung aufgrund der\n' +
                'Infektion notwendig?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: ['GKV3.3,GKV3.4,GKV3.5,GKV3.6']
                }
            ],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKV3', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKV3.3',
            question: 'Bekam ihr Kind zusätzlich Sauerstoff?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKV3.2', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKV3.4',
            question: 'Bekam Ihr Kind eine Atemunterstützung mirels Rachen-CPAP?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKV3.2', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKV3.5',
            question: 'Bekam Ihr Kind eine Atemunterstützung durch eine Intubationsbeatmung?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKV3.2', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKV3.6',
            question:
                'War der Grund für die Beatmung\n' +
                'eine Lungenentzündung\n' +
                '(Pneumonie) Ihres Kindes? ',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKV3.2', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKV4',
            question: 'Konnte das Kind als gesund entlassen werden? ',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Nein/Weiß nicht',
                    subQuestion: ['GKV4.1']
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'GKV4.1',
            question: 'Ist das Kind verstorben?',
            questionType: QuestionType.Boolean,
            subQuestions: [
                {
                    requiredAnswer: 'Nein',
                    subQuestion: ['GKV4.2']
                },
                {
                    requiredAnswer: 'Ja',
                    subQuestion: ['GKV4.3']
                }
            ],
            isOpen: false,
            issubQuestion: true
        },
        {
            questionIdentifier: 'GKV4.2',
            question: 'Ist das Kind aufgrund der SARS-CoV-2 Infektion verstorben?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKV4.1', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'GKV4.3',
            question: 'Welche Komplikationen bestanden noch bei Entlassung? ',
            questionType: QuestionType.Text,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKV4.1', operator: '=', answer: 'Nein'}]
        }*/
    ]
};

export default QuestionnaireGKV;

import {Questionnaire} from './QuestionTypes';

/**
 * Questionnaire GKM
 */
const QuestionnaireGKM: Questionnaire = {
    identifier: 'GKM',
    item: [
        /* {
            questionIdentifier: 'GKM1.1',
            question: 'In welcher Schwangerschaftswoche wurde Ihr Kind geboren?',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'GKM1.2',
            question: 'Wie war die Apgar-Zahl bei Geburt? (Zu finden im Murerpass S. 15)',
            questionType: QuestionType.Birthday,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'GKM1.3',
            question:
                'Wie war der pH-Wert der Nabelarterie bei Geburt ? (Zu finden im Murerpass S. 15)',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'GKM2.1',
            question: 'Wurde Ihr Kind bei der Geburt positiv auf SARS-CoV-2 getestet?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Nein/Weiß nicht',
                    subQuestion: ['GKM2.2']
                }
            ],
            isOpen: false,
            issubQuestion: false
        },

        {
            questionIdentifier: 'GKM2.2',
            question: 'Wurde Ihr Kind zu einem späteren Zeitpunkt positiv auf SARS-CoV-2 getestet?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKM2.1', operator: '!=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'GKM3',
            question:
                'Musste Ihr Kind aufgrund der SARS-CoV-2\n' +
                'Infektion stationär in einer Klinik behandelt\n' +
                'werden?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: ['GKM3.1,GKM3.2']
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'GKM3.1',
            question:
                'Für wie viele Tage musste Ihr\n' +
                'Kind aufgrund der Infektion\n' +
                'stationär behandelt werden?',
            questionType: QuestionType.Number,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKM3', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKM3.2',
            question:
                'War während der stationären Behandlung Ihres Kindes eine Beatmung aufgrund der Infektion notwendig?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Ja/Weiß nicht',
                    subQuestion: ['GKM3.3,GKM3.4,GKM3.5,GKM3.6']
                }
            ],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKM3', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKM3.3',
            question: 'Bekam ihr Kind zusätzlich Sauerstoff?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKM3.2', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKM3.4',
            question: 'Bekam Ihr Kind eine Atemunterstützung mirels Rachen-CPAP?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKM3.2', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKM3.5',
            question: 'Bekam Ihr Kind eine Atemunterstützung durch eine Intubationsbeatmung?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKM3.2', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKM3.6',
            question:
                'War der Grund für die Beatmung\n' +
                'eine Lungenentzündung\n' +
                '(Pneumonie) Ihres Kindes? ',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKM3.2', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'GKM4',
            question: 'Konnte Ihr Kind als gesund entlassen werden? ',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [
                {
                    requiredAnswer: 'Nein/Weiß nicht',
                    subQuestion: ['GKM4.1']
                }
            ],
            isOpen: false,
            issubQuestion: false
        },
        {
            questionIdentifier: 'GKM4.1',
            question: 'Ist Ihr Kind verstorben?',
            questionType: QuestionType.Boolean,
            subQuestions: [
                {
                    requiredAnswer: 'Nein',
                    subQuestion: ['GKM4.2']
                },
                {
                    requiredAnswer: 'Ja',
                    subQuestion: ['GKM4.3']
                }
            ],
            isOpen: false,
            issubQuestion: true
        },
        {
            questionIdentifier: 'GKM4.2',
            question: 'Ist Ihr Kind aufgrund der SARS-CoV-2 Infektion verstorben?',
            questionType: QuestionType.BasicQuestion,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKM4.1', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'GKM4.3',
            question: 'Welche Komplikationen bestanden noch bei Entlassung? ',
            questionType: QuestionType.Text,
            subQuestions: [],
            isOpen: false,
            issubQuestion: true,
            enableWhen: [{question: 'GKM4.1', operator: '=', answer: 'Nein'}]
        }*/
    ]
};

export default QuestionnaireGKM;

import {Questionnaire, QuestionType} from './QuestionTypes';

/**
 * Questionnaire FKV
 */
const QuestionnaireFKV: Questionnaire = {
    identifier: 'FKV',
    item: [
        {
            questionIdentifier: 'FKV1',
            question: 'Wie geht es der an der Studie teilnehmenden Person?',
            questionType: QuestionType.Choice,
            answerValue: [
                'symptomfrei zu Hause',
                'mit Symptomen zu Hause',
                'Mit Symptomen im Krankenhaus',
                'verstorben'
            ]
        },
        {
            questionIdentifier: 'FKV1.1',
            question: 'Wann ist die an der Studie teilnehmende Person verstorben?',
            questionType: QuestionType.Date,
            enableWhen: [
                {
                    question: 'FKV1',
                    operator: '=',
                    answer: 'verstorben'
                }
            ]
        },
        {
            questionIdentifier: 'FKV2',
            question: 'Sind Sie auch mit SARS-CoV-2 infiziert?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', ' Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'FKV3',
            question:
                'Wie oft waren Sie mit der an der Studie teilnehmenden Person in Kontakt? (Beispiele: täglich, 2 mal pro Woche)',
            questionType: QuestionType.String
        },
        {
            questionIdentifier: 'FKV4',
            question:
                'Ist die an der Studie teilnehmende Person aktuell aufgrund der SARS-CoV-2-Infektion in stationärer Behandlung',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'FKV4.1',
            question: 'Auf welcher Art von Station wird die Person behandelt?',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'FKV4', operator: '!=', answer: 'Nein'}],
            item: [
                {
                    questionIdentifier: 'FKV4.1.1',
                    question: 'Intensivstation',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'FKV4.1.2',
                    question: 'Isolierstation/Infektionsstation',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'FKV4.1.3',
                    question: 'Sonstige',
                    questionType: QuestionType.String,
                    enableWhen: [{question: 'FKV4.1.4', operator: '!exists', answer: ''}]
                },
                {
                    questionIdentifier: 'FKV4.1.4',
                    question: 'Sonstige',
                    answerValue: ['Nein'],
                    questionType: QuestionType.OpenChoice
                }
            ]
        },
        {
            questionIdentifier: 'FKV5',
            question:
                'Erhält die an der Studie teilnehmende Person aktuell aufgrund der SARS-CoV-2-Infektion eine Behandlung?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'FKV5.1',
            question: 'Wird die Person künstlich beatmet (Intubation)?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht'],
            enableWhen: [{question: 'FKV5', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'FKV6',
            question:
                'Ist die an der Studie teilnehmende Person von ihren Familienmitgliedern oder engsten Angehörigen getrennt, um eine Ansteckung zu verhindern?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        }
    ]
};

export default QuestionnaireFKV;

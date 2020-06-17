import {Questionnaire, QuestionType} from './QuestionTypes';

/**
 * Questionnaire IKV
 */
const QuestionnaireIKV: Questionnaire = {
    identifier: 'IKV',
    item: [
        {
            questionIdentifier: 'IKV1',
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
            questionIdentifier: 'IKV1.1',
            question: 'Wann ist die an der Studie teilnehmende Person verstorben?',
            questionType: QuestionType.Date,
            enableWhen: [
                {
                    question: 'IKV1',
                    operator: '=',
                    answer: 'verstorben'
                }
            ]
        },
        {
            questionIdentifier: 'IKV2',
            question: 'Sind Sie auch mit SARS-CoV-2 infiziert?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', ' Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'IKV3',
            question:
                'Wie oft waren Sie mit der an der Studie teilnehmenden Person in Kontakt? (Beispiele: täglich, 2 mal pro Woche)',
            questionType: QuestionType.String
        },
        {
            questionIdentifier: 'IKV4',
            question:
                'Ist, war oder soll die an der Studie teilnehmende Person aufgrund einer Positivtestung zur SARS-CoV-2-Infektion in Quarantäne oder Isolierstation?',
            questionType: QuestionType.Choice,
            answerValue: [
                'aktuell noch in Quarantäne',
                'geht in Quarantäne',
                'wurde aus der Quarantäne oder Isolierstation im Krankenhaus entlassen',
                'war nie aufgrund der Infektion in Quarantäne'
            ]
        },
        {
            questionIdentifier: 'IKV4.1',
            question:
                'Wann wurde die an der Studie teilnehmende Person aus der Quarantäne oder Isolierstation im Krankenhaus entlassen?',
            questionType: QuestionType.Date,
            enableWhen: [
                {
                    question: 'IKV4',
                    operator: '=',
                    answer: 'wurde aus der Quarantäne oder Isolierstation im Krankenhaus entlassen'
                }
            ]
        },
        {
            questionIdentifier: 'IKV5',
            question:
                'Ist die an der Studie teilnehmende Person aktuell aufgrund der SARS-CoV-2-Infektion in stationärer Behandlung',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'IKV5.1',
            question: 'Auf welcher Art von Station wird die Person behandelt?',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'IKV5', operator: '!=', answer: 'Nein'}],
            item: [
                {
                    questionIdentifier: 'IKV5.1.1',
                    question: 'Intensivstation',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKV5.1.2',
                    question: 'Isolierstation/Infektionsstation',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKV5.1.3',
                    question: 'Sonstige',
                    questionType: QuestionType.String,
                    enableWhen: [{question: 'IKV5.1.4', operator: '!exists', answer: ''}]
                },
                {
                    questionIdentifier: 'IKV5.1.4',
                    question: 'Sonstige',
                    answerValue: ['Nein'],
                    questionType: QuestionType.OpenChoice
                }
            ]
        },
        {
            questionIdentifier: 'IKV6',
            question:
                'Erhält die an der Studie teilnehmende Person aktuell aufgrund der SARS-CoV-2-Infektion eine Behandlung?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'IKV6.1',
            question: 'Wird die Person künstlich beatmet (Intubation)?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht'],
            enableWhen: [{question: 'IKV6', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'IKV7',
            question:
                'Ist die an der Studie teilnehmende Person von ihren Familienmitgliedern oder engsten Angehörigen getrennt, um eine Ansteckung zu verhindern?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        }
    ]
};

export default QuestionnaireIKV;

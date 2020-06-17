import {QuestionType} from './QuestionTypes';

const QuestionnaireEQ5D3L = {
    identifier: 'EQ5D3L',
    item: [
        {
            questionIdentifier: 'mobility',
            question: 'Your mobility TODAY',
            questionType: QuestionType.OpenChoice
        },
        {
            questionIdentifier: 'selfCare',
            question: 'Your self-care TODAY',
            questionType: QuestionType.OpenChoice
        },
        {
            questionIdentifier: 'usualActivities',
            question: 'Your usual activities TODAY',
            questionType: QuestionType.OpenChoice
        },
        {
            questionIdentifier: 'pain',
            question: 'Your pain / discomfort TODAY',
            questionType: QuestionType.OpenChoice
        },
        {
            questionIdentifier: 'anxiety',
            question: 'Your anxiety / depression TODAY',
            questionType: QuestionType.OpenChoice
        },
        {
            questionIdentifier: 'healthState',
            question: 'YOUR HEALTH TODAY',
            questionType: QuestionType.String
        }
    ]
};

export default QuestionnaireEQ5D3L;

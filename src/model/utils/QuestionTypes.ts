export enum QuestionType {
    Display = 0,
    Group = 1,
    Choice = 2,
    String = 3,
    Boolean = 4,
    Date = 5,
    Integer = 6,
    OpenChoice = 7,
    OpenChoiceGroup = 8
}

export type Questionnaire = {
    identifier: string;
    item: Question[];
};

export type Question = {
    questionIdentifier: string;
    enableWhen?: EnableWhen[];
    required?: boolean;
    question: string;
    questionType: QuestionType;
    answerValue?: string[];
    maxLength?: number;
    minLength?: number;
    regEx?: string;
    item?: Question[];
};

export type EnableWhen = {
    question: string;
    operator: string;
    answer: string;
};

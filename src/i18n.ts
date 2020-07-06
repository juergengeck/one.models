import i18n from 'i18next';
const i18nModelsInstance = i18n.createInstance();

const resources = {
    en: {
        translation: {
            key: 'hello world'
        }
    }
};

i18nModelsInstance.init({
    resources: resources,
    interpolation: {
        escapeValue: false
    },
    fallbackLng: 'de'
});

export default i18nModelsInstance;

import i18n from 'i18next';

const resources = {
    en: {
        translation: {
            key: 'hello world'
        }
    }
};

i18n.init({
    resources: resources,
    fallbackLng: 'de'
});

export default i18n;

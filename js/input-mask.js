$(function() {
    var dev_mode = app_config.dev_mode;
    var device_type = isMobile();
    var allowedDevice = input_mask_data.masking_device;
    if (dev_mode == "Y") {
        console.log(input_mask_data);
    }
    if (input_mask_data.enable_masking == true && allowedDevice.indexOf(device_type) != -1) {
        var phoneField = $(cb.formElementSelectors.phone);
        var creditCardField = $(cb.formElementSelectors.cardNumber);
        //Phone number masking
        if ($(phoneField).length && input_mask_data.phone_number_masking) {
            if ($(phoneField).attr('data-min-length') > input_mask_data.phone_number_masking.length) {
                $(phoneField).attr('data-min-length', input_mask_data.phone_number_masking.length);
            }
            if ($(phoneField).attr('data-max-length') != input_mask_data.phone_number_masking.length) {
                $(phoneField).attr('data-max-length', input_mask_data.phone_number_masking.length)
            }
            $(phoneField).mask(input_mask_data.phone_number_masking);
        }
        //cc masking

        var iosVer = checkVersion();
        var bindEvent = 'keyup input';
        if(iosVer == 9) {
            bindEvent = 'keydown input';
        }
        if (input_mask_data.credit_card_place_holder_active || input_mask_data.enable_credit_Card_masking) {
            if ($(creditCardField).length && input_mask_data.credit_card_masking !== 'no_masking') {

                $(creditCardField).off('keyup').off('keypress').off('change');
                $(creditCardField).attr('maxlength', 19);
                var maskChar = input_mask_data.credit_card_masking === 'space_masking' ? ' ' : '-';
                if (input_mask_data.credit_card_place_holder_active) {
                    var placeHolderType = input_mask_data.credit_card_masking_placeholder;
                    if(typeof placeHolderType == 'undefined')
                    {
                        placeHolderType = 'blank';
                    }

                    var data = {
                        mask: '9999-9999-9999-9999',
                        clearMaskOnLostFocus: false,
                    };


                    if(placeHolderType == 'cross')
                    {
                        data = {
                            mask: '9999-9999-9999-9999',
                            clearMaskOnLostFocus: false,
                            placeholder: "xxxx-xxxx-xxxx-xxxx"
                        };
                    }

                    $('[name=creditCardType]').change(function (e) {
                        $('[name=creditCardNumber]').removeAttr('maxlength');
                    });

                    $(creditCardField).inputmask(data);

                    $(creditCardField).on(bindEvent,function (){
                         guessCardType();
                    });
                }



                if (!input_mask_data.credit_card_place_holder_active && input_mask_data.enable_credit_Card_masking) {

                    $(creditCardField).on(bindEvent,function (){
                        performCardNumberMasking(data);
                    });
                }
    //             $(creditCardField).on('keyup blur',function (){
    //                 performCardNumberMasking(data);
    //             });
            }
        }
    }

    function performCardNumberMasking(maskData) {
        guessCardType();
        var cardType = $('[name=creditCardType]').val();
        var maxLength = validator.getCardNumberMaxLength(cardType);
        var noOfParts = Math.ceil(maxLength / 4);
        var setLength = maxLength + noOfParts - 1;
        $(creditCardField).attr('maxlength', setLength);
        var maskText = '';
        for (var ii = 0; ii < maxLength; ii++) {
            if (ii !== 0 && ii % 4 === 0) {
                maskText += maskChar;
            }
            maskText += input_mask_data.credit_card_place_holder_active ? '9' : '0';
        }
        if ((cardType) && cardType == "amex" && input_mask_data.enable_standardamex)
        {
           
            if(typeof maskData !== "undefined" &&  maskData.hasOwnProperty('mask'))
                maskData['mask'] = '9999' + maskChar + '999999' + maskChar + '99999';
            if (typeof maskData !== "undefined" &&  maskData.hasOwnProperty('placeholder') && maskData['placeholder'] == 'cross') {
                maskData['placeholder'] = "xxxx-xxxxxx-xxxxx";
            }
            maskText = (input_mask_data.credit_card_place_holder_active) ? '9999' + maskChar + '999999' + maskChar + '99999' : '0000' + maskChar + '000000' + maskChar + '00000';
        }
        if (input_mask_data.credit_card_place_holder_active)
        {
            $(creditCardField).inputmask(maskData);
        } else {
            $(creditCardField).mask(maskText);
        }
    }

    function isMobile() {
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            return 'mobile';
        } else {
            return 'desktop';
        }
    }

    function guessCardType() {
        var cardNumberElement = $(cb.formElementSelectors.cardNumber);
        var cardTypeElement = $(cb.formElementSelectors.cardType);
        var unmaskedCardNumber = cardNumberElement.val().trim().replace(/[\s-]/g, '');
        var cardType = validator.getCardType(unmaskedCardNumber);
        if (cardType === false) {
            if (typeof app_config.allowed_tc !== 'undefined' && app_config.allowed_tc.length) {
                var matchType = false;

                var allowed_tc = cb.decryptAllowedTestCard(app_config.allowed_tc);

                $(allowed_tc).each(function(k, v) {
                    var testCardParts = v.toString().split('|');
                    if (unmaskedCardNumber === testCardParts[0]) {
                        cardType = testCardParts[1];
                        return true;
                    }
                });
            }
        }
        if (cardTypeElement.find('option[value=' + cardType + ']').length) {
            cardTypeElement.val(cardType).trigger('change');
            cardTypeElement.removeClass(cb.errorClass).addClass(cb.validClass);
        } else {
            if (cardTypeElement.data('deselect') != false) {
                cardTypeElement.val('').trigger('change');
                cardTypeElement.addClass(cb.errorClass).removeClass(cb.validClass);
            }
        }
    }
    
    function checkVersion() {
        var agent = window.navigator.userAgent,
        start = agent.indexOf( 'OS' );
        if( ( agent.indexOf( 'iPhone' ) > -1 || agent.indexOf( 'iPad' ) > -1 ) && start > -1 ){
            return window.Number( agent.substr( start + 3, 3 ).replace( '_', '.' ) );
        }
    }
});
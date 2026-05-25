(function ()
{
    const PUBLIC_API_BASE = 'https://api.drawzoffers.com/api/public';
    const FITACCESS_UPSELL_URL = 'https://www.fitaccess.app/api/integrations/upsell-purchases';
    const PROJECT_API_KEY = '4cb5ac3a-b79f-4593-bc72-6a8b8fe974f0';
    const DEFAULT_COUNTRY_ISO = 'US';
    const DEFAULT_ITEM_KEY = 'main';
    const storagePrefix = 'yetiReady';
    const stateKey = `${storagePrefix}Flow`;
    const leadKey = `${storagePrefix}Lead`;
    const checkoutKey = `${storagePrefix}Checkout`;

    window.yetiApiFlow = {
        PUBLIC_API_BASE,
        FITACCESS_UPSELL_URL,
        PROJECT_API_KEY,
        DEFAULT_COUNTRY_ISO,
        DEFAULT_ITEM_KEY,
        persistLanding,
        getState,
        saveState,
        syncLandingClick,
        ensureLandingClick,
        createLeadRecord,
        createPurchase,
        createUpsellPurchase,
        moneyToNumber,
        formatMoney,
        brandName
    };

    function persistLanding(config)
    {
        const params = new URLSearchParams(window.location.search);
        const incomingTracking = sanitizeTrackingParams(params);
        const hasIncomingParams = params.toString().length > 0;
        const stored = getState();
        const defaultState = {
            productName: config.productName || 'Main Offer',
            entryPrice: config.entryPrice || '$0.00',
            upsellPrice: config.upsellPrice || '$0.00',
            entryAmount: moneyToNumber(config.entryPrice || 0),
            upsellAmount: moneyToNumber(config.upsellPrice || 0),
            tracking: incomingTracking,
            stage: 'landing',
            flowNonce: createFlowNonce()
        };

        if (hasIncomingParams)
        {
            removeStoredState(localStorage);
            removeStoredState(sessionStorage);
        }

        const nextState = hasIncomingParams ? defaultState : {
            ...defaultState,
            ...stored,
            productName: stored.productName || defaultState.productName,
            entryPrice: stored.entryPrice || defaultState.entryPrice,
            upsellPrice: stored.upsellPrice || defaultState.upsellPrice,
            entryAmount: Number.isFinite(Number(stored.entryAmount)) ? Number(stored.entryAmount) : defaultState.entryAmount,
            upsellAmount: Number.isFinite(Number(stored.upsellAmount)) ? Number(stored.upsellAmount) : defaultState.upsellAmount,
            customer: getEffectiveCustomer(stored),
            tracking: getEffectiveTracking(Object.keys(stored.tracking || {}).length ? stored : defaultState),
            stage: stored.stage || 'landing',
            flowNonce: stored.flowNonce || defaultState.flowNonce
        };

        saveState(nextState);
        return nextState;
    }

    function getState()
    {
        const local = readStoredState(localStorage);
        const session = readStoredState(sessionStorage);

        const state = sanitizeObject({
            ...local,
            ...session
        });

        state.customer = getEffectiveCustomer(state);
        state.tracking = getEffectiveTracking(state);
        return state;
    }

    function saveState(nextState)
    {
        const sanitized = sanitizeObject(nextState);
        const payload = JSON.stringify(sanitized);
        const localSaved = writeStoredState(localStorage, payload);
        const sessionSaved = writeStoredState(sessionStorage, payload);

        syncLegacyState(sanitized);
        return localSaved || sessionSaved;
    }

    async function syncLandingClick()
    {
        const state = getState();
        const tracking = getEffectiveTracking(state);
        const currentClickId = tracking.click_id || '';

        if (state.api?.clickSynced && state.api?.sessionId && (!currentClickId || currentClickId === (state.api?.trackingClickId || '')))
        {
            return state.api.sessionId;
        }

        const payload = {
            projectApiKey: PROJECT_API_KEY,
            click_id: currentClickId,
            requestUri: buildCurrentUrl(),
            pageType: 'Lead',
            affiliateId: tracking.aff_id || '',
            subAffiliateId: tracking.source || '',
            subAffiliateId2: tracking.sub_source || '',
            subAffiliateId3: tracking.p1 || '',
            subAffiliateId4: tracking.p2 || '',
            subAffiliateId5: tracking.p3 || ''
        };

        try
        {
            const response = await postJson('/clicks', payload);
            const nextState = {
                ...state,
                tracking,
                api: {
                    ...(state.api || {}),
                    clickId: response.clickId || '',
                    sessionId: response.sessionId || '',
                    trackingClickId: response.trackingClickId || payload.click_id || '',
                    crmClickSyncStatus: response.crmClickSyncStatus || 'synced',
                    clickSynced: true
                }
            };

            saveState(nextState);
            return response.sessionId || '';
        }
        catch (error)
        {
            console.error('Landing click sync failed', error);
            return '';
        }
    }

    async function ensureLandingClick()
    {
        const state = getState();
        const currentClickId = state.tracking?.click_id || '';

        if (state.api?.sessionId && (!currentClickId || currentClickId === (state.api?.trackingClickId || '')))
        {
            return state.api.sessionId;
        }

        return syncLandingClick();
    }

    async function createLeadRecord(state)
    {
        const customer = state.customer || {};
        const tracking = getEffectiveTracking(state);
        const payload = {
            projectApiKey: PROJECT_API_KEY,
            sessionId: state.api?.sessionId || '',
            click_id: tracking.click_id || '',
            firstName: customer.firstName || '',
            lastName: customer.lastName || '',
            email: customer.email || '',
            phone: customer.phone || '',
            address1: customer.shippingAddress1 || customer.address1 || '',
            city: customer.shippingCity || customer.city || '',
            state: customer.shippingState || customer.state || '',
            countryIso: DEFAULT_COUNTRY_ISO,
            zipCode: customer.shippingZip || customer.zipCode || customer.zip || '',
            affiliateId: tracking.aff_id || '',
            subAffiliateId: tracking.source || ''
        };

        const response = await postJson('/leads', payload);

        if (response.crmLeadSyncStatus === 'failed')
        {
            throw new Error(response.error || 'Lead submission failed.');
        }

        return response;
    }

    async function createPurchase(state)
    {
        const customer = state.customer || {};
        const payment = state.payment || {};
        const tracking = getEffectiveTracking(state);
        const payload = {
            projectApiKey: PROJECT_API_KEY,
            leadId: state.api?.leadId || '',
            sessionId: state.api?.sessionId || '',
            click_id: tracking.click_id || '',
            firstName: customer.firstName || '',
            lastName: customer.lastName || '',
            email: customer.email || '',
            phone: customer.phone || '',
            address1: customer.shippingAddress1 || customer.address1 || '',
            city: customer.shippingCity || customer.city || '',
            state: customer.shippingState || customer.state || '',
            countryIso: DEFAULT_COUNTRY_ISO,
            zipCode: customer.shippingZip || customer.zipCode || customer.zip || '',
            cardNumber: payment.cardNumber || '',
            cardMonth: payment.expMonth || '',
            cardYear: payment.expYear || '',
            cardSecurityCode: payment.cvv || '',
            items: [
                {
                    key: DEFAULT_ITEM_KEY,
                    quantity: 1
                }
            ]
        };

        const response = await postJson('/purchase-confirm', payload);

        if (response.crmOrderSyncStatus === 'failed')
        {
            throw new Error(response.error || 'Payment was not approved.');
        }

        return response;
    }

    async function createUpsellPurchase(state)
    {
        const customer = state.customer || {};
        const payment = state.payment || {};
        const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
        const payload = {
            customerId: state.api?.crmCustomerId || '',
            firstName: customer.firstName || '',
            lastName: customer.lastName || '',
            email: customer.email || '',
            phone: customer.phone || '',
            address1: customer.shippingAddress1 || customer.address1 || '',
            city: customer.shippingCity || customer.city || '',
            state: customer.shippingState || customer.state || '',
            zip: customer.shippingZip || customer.zipCode || customer.zip || '',
            country: DEFAULT_COUNTRY_ISO,
            paymentMethod: {
                cardNumber: payment.cardNumber || '',
                expiryMonth: payment.expMonth || '',
                expiryYear: payment.expYear || '',
                cvv: payment.cvv || '',
                cardHolderName: fullName || customer.email || ''
            }
        };

        if (!payload.email || !payload.paymentMethod.cardNumber || !payload.paymentMethod.expiryMonth || !payload.paymentMethod.expiryYear || !payload.paymentMethod.cvv)
        {
            throw new Error('Upsell payment details are incomplete. Please restart checkout.');
        }

        return postJsonAbsolute(FITACCESS_UPSELL_URL, payload);
    }

    async function postJson(path, payload)
    {
        const response = await fetch(`${PUBLIC_API_BASE}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => null);

        if (!response.ok)
        {
            throw new Error(data?.message || data?.error || 'Request failed.');
        }

        return data || {};
    }

    async function postJsonAbsolute(url, payload)
    {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => null);

        if (!response.ok)
        {
            throw new Error(data?.message || data?.error || 'Request failed.');
        }

        return data || {};
    }

    function syncLegacyState(state)
    {
        const customer = state.customer || {};
        const payment = state.payment || {};

        writeJson(sessionStorage, leadKey, {
            firstName: customer.firstName || '',
            lastName: customer.lastName || '',
            email: customer.email || '',
            phone: customer.phone || '',
            shippingAddress1: customer.shippingAddress1 || customer.address1 || '',
            shippingCity: customer.shippingCity || customer.city || '',
            shippingState: customer.shippingState || customer.state || '',
            shippingZip: customer.shippingZip || customer.zipCode || customer.zip || '',
            termsAccepted: Boolean(customer.termsAccepted),
            product: state.productName || 'Main Offer',
            entryPrice: state.entryPrice || '$0.00',
            savedAt: state.savedAt || new Date().toISOString()
        });

        writeJson(sessionStorage, checkoutKey, {
            status: state.stage === 'thankyou' || state.stage === 'checkout-complete' ? 'completed' : '',
            product: state.productName || 'Main Offer',
            cardLast4: payment.cardLast4 || '',
            cardBrand: payment.cardBrand || '',
            amountCharged: state.entryPrice || '$0.00',
            upsellConsent: state.upsellPurchased ? 'accepted' : 'declined',
            upsellPrice: state.upsellPurchased ? (state.upsellPrice || '$0.00') : '$0.00',
            upsellProduct: 'FitAccess',
            totalCharged: formatMoney(Number(state.entryAmount || 0) + (state.upsellPurchased ? Number(state.upsellAmount || 0) : 0)),
            completedAt: state.completedAt || new Date().toISOString()
        });
    }

    function sanitizeTrackingParams(searchParams)
    {
        const blocked = new Set([
            'fname',
            'firstname',
            'first_name',
            'lname',
            'lastname',
            'last_name',
            'email',
            'phone',
            'address',
            'street',
            'city',
            'state',
            'zip',
            'zipcode',
            'postal_code'
        ]);
        const allowed = new Set([
            'aff_id',
            'source',
            'sub_source',
            'p1',
            'p2',
            'p3',
            'click_id',
            'campaign_id',
            'creative_id',
            'placement_id',
            'utm_source',
            'utm_medium',
            'utm_campaign',
            'utm_content',
            'utm_term'
        ]);
        const output = {};
        let count = 0;

        searchParams.forEach((value, key) =>
        {
            const normalizedKey = String(key).toLowerCase();
            const normalizedValue = String(value || '').trim();

            if (
                count < 20
                && allowed.has(normalizedKey)
                && !blocked.has(normalizedKey)
                && normalizedValue
                && !/^(https?:|file:|javascript:|data:|blob:)/i.test(normalizedValue)
            )
            {
                output[key] = normalizedValue.slice(0, 200);
                count += 1;
            }
        });

        return sanitizeObject(output);
    }

    function getEffectiveTracking(state)
    {
        return sanitizeObject({
            ...((state && state.tracking) || {}),
            ...sanitizeTrackingParams(new URLSearchParams(window.location.search))
        });
    }

    function getEffectiveCustomer(state)
    {
        return sanitizeObject({
            ...((state && state.customer) || {}),
            firstName: sanitizeTextValue(new URLSearchParams(window.location.search).get('firstName'), 45),
            lastName: sanitizeTextValue(new URLSearchParams(window.location.search).get('lastName'), 45),
            email: sanitizeTextValue(new URLSearchParams(window.location.search).get('email'), 120),
            phone: formatUsPhoneValue(new URLSearchParams(window.location.search).get('phone')),
            shippingAddress1: sanitizeTextValue(new URLSearchParams(window.location.search).get('address'), 80),
            shippingCity: sanitizeTextValue(new URLSearchParams(window.location.search).get('city'), 45),
            shippingState: sanitizeTextValue(new URLSearchParams(window.location.search).get('state'), 20).toUpperCase(),
            shippingZip: String(new URLSearchParams(window.location.search).get('zip') || '').replace(/\D/g, '').slice(0, 5)
        });
    }

    function sanitizeTextValue(value, maxLength)
    {
        return String(value || '').trim().slice(0, maxLength || 120);
    }

    function formatUsPhoneValue(value)
    {
        const digits = String(value || '').replace(/\D/g, '').slice(0, 10);

        if (digits.length > 6)
        {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }

        if (digits.length > 3)
        {
            return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        }

        if (digits.length > 0)
        {
            return `(${digits}`;
        }

        return '';
    }

    function sanitizeObject(input)
    {
        if (!input || typeof input !== 'object')
        {
            return {};
        }

        const out = {};

        Object.entries(input).forEach(([key, value]) =>
        {
            if (value === null || value === undefined)
            {
                return;
            }

            if (Array.isArray(value))
            {
                out[key] = value.map((item) => typeof item === 'string' ? item.trim() : item);
                return;
            }

            if (typeof value === 'object')
            {
                out[key] = sanitizeObject(value);
                return;
            }

            out[key] = typeof value === 'string' ? value.trim() : value;
        });

        return out;
    }

    function moneyToNumber(value)
    {
        return Number(String(value || '').replace(/[^0-9.]/g, '')) || 0;
    }

    function formatMoney(value)
    {
        return `$${Number(value || 0).toFixed(2)}`;
    }

    function brandName(brand)
    {
        return {
            visa: 'Visa',
            mastercard: 'Mastercard',
            amex: 'American Express',
            discover: 'Discover',
            jcb: 'JCB',
            diners: 'Diners Club',
            maestro: 'Maestro',
            unionpay: 'UnionPay'
        }[brand] || 'Card';
    }

    function createFlowNonce()
    {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function buildCurrentUrl()
    {
        return window.location.href.slice(0, 1000);
    }

    function readStoredState(storage)
    {
        try
        {
            return sanitizeObject(JSON.parse(storage.getItem(stateKey)) || {});
        }
        catch (error)
        {
            return {};
        }
    }

    function writeStoredState(storage, payload)
    {
        try
        {
            storage.setItem(stateKey, payload);
            return true;
        }
        catch (error)
        {
            return false;
        }
    }

    function removeStoredState(storage)
    {
        try
        {
            storage.removeItem(stateKey);
            storage.removeItem(leadKey);
            storage.removeItem(checkoutKey);
        }
        catch (error)
        {
            return;
        }
    }

    function writeJson(storage, key, value)
    {
        try
        {
            storage.setItem(key, JSON.stringify(value));
        }
        catch (error)
        {
            return;
        }
    }
})();

'use strict';
/**
 * rdap.js — 域名注册信息（RDAP，无需密钥）→ 域名年龄等信任信号
 */
const { getJson } = require('./httpclient');

async function getDomainAgeYears(domain, timeout = 10000) {
  try {
    const data = await getJson('https://rdap.org/domain/' + encodeURIComponent(domain), { timeout });
    const events = Array.isArray(data.events) ? data.events : [];
    const reg = events.find((e) => e.eventAction === 'registration');
    const exp = events.find((e) => e.eventAction === 'expiration');
    if (!reg || !reg.eventDate) return null;
    const registered = new Date(reg.eventDate);
    if (Number.isNaN(registered.getTime())) return null;
    return {
      registeredAt: registered.toISOString().slice(0, 10),
      ageYears: Math.max(0, Math.round(((Date.now() - registered.getTime()) / 31557600000) * 10) / 10),
      expiresAt: exp && exp.eventDate ? exp.eventDate.slice(0, 10) : null,
      registrar: (data.entities || []).find((e) => (e.roles || []).includes('registrar'))?.vcardArray?.[1]?.find((v) => v[0] === 'fn')?.[3] || null,
    };
  } catch (e) {
    return null;
  }
}

module.exports = { getDomainAgeYears };

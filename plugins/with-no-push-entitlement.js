// Compos Kişisel ücretsiz Apple ID ile (iLoader/SideStore) imzalanıyor; ücretsiz hesapta push yetkisi
// (aps-environment) yok ve imzalamayı bozabilir. Koç bildirimleri YEREL bildirim (sunucuyu arka planda
// yoklayıp) olduğu için bu yetkiye gerek yok — herhangi bir eklenti eklediyse kaldırılır.
const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = function withNoPushEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
};

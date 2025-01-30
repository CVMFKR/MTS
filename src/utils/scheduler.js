module.exports = (client) => {
    const rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = 6; // Sábado
    rule.hour = 18;
    rule.minute = 0;
    rule.tz = 'America/Santiago';

    schedule.scheduleJob(rule, () => {
        const groupId = 'ID_DEL_GRUPO@c.us'; // Reemplazar con ID real
        const message = `📅 *Recordatorio de Turnos* ⏰\n\n` +
            `Hoy es sábado y es hora de tomar turnos!\n` +
            `Link: https://1drv.ms/x/s!AjucDJ3soG62hJh0vkRRsYyH0sDOzw?e=uet2cJ`;
        
        client.sendMessage(groupId, message);
    });
};
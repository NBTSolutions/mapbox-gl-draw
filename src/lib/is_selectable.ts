/**
 * Determine if a selectable parameter was passed into a modes options
 *
 * @param {object} options
 * @return {boolean} selectable
 */
export default function isSelectable(opts) {
  return opts.hasOwnProperty('selectable') ? !!opts.selectable : true;
}

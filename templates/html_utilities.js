function create_element(html_element, element_id){
        const elem = document.createElement(html_element);
        elem.id = element_id
        return elem
}

function get_element_by_id(element_id){
    return document.getElementById(element_id)
}